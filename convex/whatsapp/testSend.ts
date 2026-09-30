/**
 * "Send test message" from Settings — lets an admin verify the Times integration end to end
 * with their own number before any campaign runs.
 *
 * Guards: signed-in allowlisted users only (authed builders), E.164 mobile validation,
 * opted-out numbers refused, max 5 sends per user per 10 minutes, every attempt audited.
 */
import { ConvexError, v } from 'convex/values';
import { normalizePhone } from '../../shared/customerImport/phone';
import { fillTemplate } from '../../shared/templates';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { internalMutation } from '../_generated/server';
import { authedAction, authedQuery } from '../lib/access';
import { getWhatsAppProvider } from './index';

export const RATE_LIMIT = { max: 5, windowMs: 10 * 60_000 };

export const reserve = internalMutation({
  args: {
    userId: v.id('users'),
    to: v.string(),
    templateName: v.string(),
    languageCode: v.string(),
    bodyParams: v.array(v.string()),
    templateText: v.optional(v.string()),
    provider: v.string(),
  },
  handler: async (ctx, a) => {
    const optedOut = await ctx.db.query('customers').withIndex('by_phone', (i) => i.eq('phone', a.to)).unique();
    if (optedOut?.eligibility === 'OPTED_OUT') throw new ConvexError('This number has opted out of WhatsApp messages. It must not be messaged.');

    const since = Date.now() - RATE_LIMIT.windowMs;
    const recent = await ctx.db
      .query('testSends')
      .withIndex('by_user', (i) => i.eq('requestedBy', a.userId).gte('_creationTime', since))
      .collect();
    if (recent.length >= RATE_LIMIT.max) throw new ConvexError(`Limit reached: ${RATE_LIMIT.max} test messages per 10 minutes.`);

    return ctx.db.insert('testSends', {
      requestedBy: a.userId,
      to: a.to,
      templateName: a.templateName,
      languageCode: a.languageCode,
      bodyParams: a.bodyParams,
      templateText: a.templateText,
      provider: a.provider,
      status: 'QUEUED',
    });
  },
});

export const complete = internalMutation({
  args: {
    id: v.id('testSends'),
    ok: v.boolean(),
    providerMessageId: v.optional(v.string()),
    httpStatus: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: (ctx, { id, ok, ...rest }) => ctx.db.patch(id, { status: ok ? 'SENT' : 'FAILED', ...rest }),
});

type SendOutcome = { ok: true; providerMessageId: string | null } | { ok: false; error: string; httpStatus: number | null };

export const send = authedAction({
  args: {
    to: v.string(),
    templateName: v.string(),
    languageCode: v.string(),
    bodyParams: v.array(v.string()),
    /** What the template says (for the conversation view + the AI's context). */
    templateText: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SendOutcome> => {
    const phone = normalizePhone(args.to);
    if (!phone.ok) throw new ConvexError(`Invalid number: ${phone.reason}`);
    const templateName = args.templateName.trim();
    if (!/^[a-z0-9_]{1,512}$/.test(templateName)) throw new ConvexError('Template name must be lowercase letters, numbers and underscores (as approved in WhatsApp).');
    const languageCode = args.languageCode.trim() || 'en';
    const bodyParams = args.bodyParams.map((p) => p.trim()).slice(0, 20);

    const provider = getWhatsAppProvider();
    const id: Id<'testSends'> = await ctx.runMutation(internal.whatsapp.testSend.reserve, {
      userId: ctx.user._id,
      to: phone.e164,
      templateName,
      languageCode,
      bodyParams,
      templateText: args.templateText?.slice(0, 2000),
      provider: provider.name,
    });

    const result = await provider.sendTemplate({ to: phone.e164, templateName, languageCode, bodyParams });
    await ctx.runMutation(internal.whatsapp.testSend.complete, {
      id,
      ok: result.ok,
      providerMessageId: result.ok ? (result.providerMessageId ?? undefined) : undefined,
      httpStatus: result.httpStatus ?? undefined,
      error: result.ok ? undefined : result.error,
    });
    if (result.ok) {
      await ctx.runMutation(internal.engine.recordTestConversation, {
        to: phone.e164,
        templateName,
        templateText: args.templateText ? fillTemplate(args.templateText, bodyParams).slice(0, 2000) : undefined,
        providerMessageId: result.providerMessageId ?? undefined,
      });
    }
    console.info(`[whatsapp] test send by ${ctx.user.email}: ${templateName} → ${phone.e164.slice(0, 5)}… ${result.ok ? 'SENT' : `FAILED (${result.error})`}`);
    return result.ok ? { ok: true, providerMessageId: result.providerMessageId } : { ok: false, error: result.error, httpStatus: result.httpStatus };
  },
});

/** The signed-in user's recent test sends. */
export const recent = authedQuery({
  args: {},
  handler: (ctx) =>
    ctx.db
      .query('testSends')
      .withIndex('by_user', (i) => i.eq('requestedBy', ctx.user._id))
      .order('desc')
      .take(10),
});

/** Recent webhook calls from Times — for confirming the integration and mapping the payload format. */
export const recentWebhooks = authedQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('webhookEvents').order('desc').take(10);
    return rows.map((r) => ({
      _id: r._id,
      _creationTime: r._creationTime,
      eventType: r.eventType ?? 'unknown',
      status: r.status,
      error: r.error ?? null,
      payload: JSON.stringify(r.payload).slice(0, 3000),
    }));
  },
});
