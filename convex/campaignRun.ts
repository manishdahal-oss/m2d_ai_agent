/**
 * Campaign sending: uploaded contacts → first WhatsApp template.
 *
 *   create  → READY
 *   start   → RUNNING: enroll() pages through eligible, never-messaged customers (200/page)
 *                      tick()   sends `sendRatePerMinute` templates per minute, then reschedules
 *   pause   → PAUSED (the loop stops at its next step); start again resumes
 *   done    → COMPLETED when everyone enrolled has been attempted
 *
 * Safety: eligibility is re-checked right before each send (opt-outs mid-campaign are skipped),
 * one idempotency key per conversation (never two templates to the same person), a loop token so
 * only one send loop runs, and auto-pause on errors that would fail every send (bad key, template).
 */
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { getOrCreateConversation, transition } from './engine';
import { authedMutation, authedQuery } from './lib/access';
import { getWhatsAppProvider } from './whatsapp/index';
import { fillTemplate } from '../shared/templates';

const ENROLL_PAGE = 200;
const MAX_RATE = 60;

/** Fill {{name}}, {{city}}, {{business_type}} from the customer. */
export function renderTemplate(text: string, c: { name?: string; city?: string; businessType?: string }): string {
  return text
    .replace(/\{\{\s*name\s*\}\}/gi, c.name?.trim() || 'ji')
    .replace(/\{\{\s*city\s*\}\}/gi, c.city?.trim() || '')
    .replace(/\{\{\s*business_type\s*\}\}/gi, c.businessType?.trim() || '')
    .trim();
}

/* ───────────────────────── Dashboard API ───────────────────────── */

/** How many customers a new campaign would reach right now. */
export const audience = authedQuery({
  args: {},
  handler: async (ctx) => {
    const CAP = 20_000;
    const rows = await ctx.db.query('customers').withIndex('by_eligibility_activity', (i) => i.eq('eligibility', 'ELIGIBLE')).take(CAP + 1);
    const fresh = rows.filter((c) => !c.isDemo && !c.latestConversationId).length;
    return { reachable: fresh, eligible: rows.length, alreadyMessaged: rows.length - fresh, capped: rows.length > CAP };
  },
});

export const create = authedMutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    templateName: v.string(),
    templateLanguage: v.string(),
    templateText: v.string(),
    templateParams: v.array(v.string()),
    sendRatePerMinute: v.number(),
  },
  handler: async (ctx, a) => {
    const name = a.name.trim();
    const templateName = a.templateName.trim();
    if (!name) throw new ConvexError('Give the campaign a name.');
    if (!/^[a-z0-9_]{1,512}$/.test(templateName)) throw new ConvexError('Template name must be the approved WhatsApp name: lowercase letters, numbers, underscores.');
    if (!a.templateText.trim()) throw new ConvexError('Paste the template text (what customers will see).');
    const rate = Math.round(a.sendRatePerMinute);
    if (!(rate >= 1 && rate <= MAX_RATE)) throw new ConvexError(`Send rate must be between 1 and ${MAX_RATE} per minute.`);
    return ctx.db.insert('campaigns', {
      name,
      description: a.description?.trim() || undefined,
      segment: { eligibility: 'ELIGIBLE', neverMessaged: true },
      messageTemplate: a.templateText.trim(),
      providerTemplateName: templateName,
      templateLanguage: a.templateLanguage.trim() || 'en',
      templateParams: a.templateParams.map((p) => p.trim()).slice(0, 10),
      status: 'READY',
      sendRatePerMinute: rate,
      isDemo: false,
      createdBy: ctx.user._id,
      enrolled: 0,
      sent: 0,
      failed: 0,
    });
  },
});

export const start = authedMutation({
  args: { campaignId: v.id('campaigns'), confirm: v.literal(true) },
  handler: async (ctx, { campaignId }) => {
    const c = await ctx.db.get(campaignId);
    if (!c || c.isDemo || c.isSystem) throw new ConvexError('Campaign not found.');
    if (c.status !== 'READY' && c.status !== 'PAUSED') throw new ConvexError(`Campaign is ${c.status.toLowerCase()}.`);
    const loopToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await ctx.db.patch(campaignId, { status: 'RUNNING', startedAt: c.startedAt ?? Date.now(), pausedAt: undefined, loopToken, lastError: undefined });
    if (!c.enrollmentDone) await ctx.scheduler.runAfter(0, internal.campaignRun.enroll, { campaignId, cursor: null });
    await ctx.scheduler.runAfter(0, internal.campaignRun.tick, { campaignId, loopToken });
    console.info(`[campaign] ${c.name} started by ${ctx.user.email}`);
  },
});

export const pause = authedMutation({
  args: { campaignId: v.id('campaigns') },
  handler: async (ctx, { campaignId }) => {
    const c = await ctx.db.get(campaignId);
    if (!c || c.status !== 'RUNNING') throw new ConvexError('Campaign is not running.');
    await ctx.db.patch(campaignId, { status: 'PAUSED', pausedAt: Date.now(), loopToken: undefined });
  },
});

/* ───────────────────────── Enrollment ───────────────────────── */

export const enroll = internalMutation({
  args: { campaignId: v.id('campaigns'), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { campaignId, cursor }) => {
    const c = await ctx.db.get(campaignId);
    if (!c) return;
    const page = await ctx.db
      .query('customers')
      .withIndex('by_eligibility_activity', (i) => i.eq('eligibility', 'ELIGIBLE'))
      .paginate({ cursor, numItems: ENROLL_PAGE });
    let added = 0;
    for (const customer of page.page) {
      // Never message someone twice across campaigns, and never demo records.
      if (customer.isDemo || customer.latestConversationId) continue;
      const cc = await ctx.db.insert('campaignCustomers', { campaignId, customerId: customer._id, eligibility: 'ELIGIBLE' });
      const conv = await getOrCreateConversation(ctx, customer, campaignId, 'NEW');
      await ctx.db.patch(conv._id, { campaignCustomerId: cc });
      added++;
    }
    await ctx.db.patch(campaignId, { enrolled: (c.enrolled ?? 0) + added, ...(page.isDone ? { enrollmentDone: true } : {}) });
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.campaignRun.enroll, { campaignId, cursor: page.continueCursor });
  },
});

/* ───────────────────────── Sending ───────────────────────── */

type Batch =
  | { stop: string }
  | { stop: null; rate: number; templateName: string; language: string; conversations: Array<Id<'conversations'>>; enrollmentDone: boolean };

export const nextBatch = internalQuery({
  args: { campaignId: v.id('campaigns'), loopToken: v.string() },
  handler: async (ctx, { campaignId, loopToken }): Promise<Batch> => {
    const c = await ctx.db.get(campaignId);
    if (!c) return { stop: 'campaign deleted' };
    if (c.status !== 'RUNNING') return { stop: `campaign ${c.status.toLowerCase()}` };
    if (c.loopToken !== loopToken) return { stop: 'superseded by a newer send loop' };
    const rate = Math.min(MAX_RATE, Math.max(1, c.sendRatePerMinute));
    const rows = await ctx.db
      .query('conversations')
      .withIndex('by_campaign_state_last_message', (i) => i.eq('campaignId', campaignId).eq('state', 'NEW'))
      .take(rate);
    return { stop: null, rate, templateName: c.providerTemplateName ?? '', language: c.templateLanguage, conversations: rows.map((r) => r._id), enrollmentDone: !!c.enrollmentDone };
  },
});

type Reserved = { messageId: Id<'messages'>; phone: string; params: string[] } | { skip: string };

export const reserveTemplate = internalMutation({
  args: { conversationId: v.id('conversations') },
  handler: async (ctx, { conversationId }): Promise<Reserved> => {
    const conv = await ctx.db.get(conversationId);
    if (!conv || conv.state !== 'NEW') return { skip: 'not NEW' };
    const key = `template:${conversationId}`;
    if (await ctx.db.query('messages').withIndex('by_idempotency_key', (i) => i.eq('idempotencyKey', key)).first()) return { skip: 'already sent' };
    const [customer, campaign] = await Promise.all([ctx.db.get(conv.customerId), ctx.db.get(conv.campaignId)]);
    if (!customer || !campaign) return { skip: 'missing customer/campaign' };
    if (customer.eligibility !== 'ELIGIBLE' || customer.isDemo) {
      // Became ineligible (opted out / assigned / on Desktop) after enrollment.
      await transition(ctx, conv, customer.eligibility === 'OPTED_OUT' ? 'STOPPED' : 'FAILED', `Skipped: customer is ${customer.eligibility.toLowerCase().replace(/_/g, ' ')}`, 'system');
      return { skip: 'ineligible' };
    }
    const fields = { name: customer.name, city: customer.city, businessType: customer.businessType };
    const params = (campaign.templateParams ?? []).map((p) => renderTemplate(p, fields));
    const messageId = await ctx.db.insert('messages', {
      conversationId,
      customerId: customer._id,
      direction: 'OUTBOUND',
      senderType: 'SYSTEM',
      body: fillTemplate(renderTemplate(campaign.messageTemplate ?? `[Template: ${campaign.providerTemplateName}]`, fields), params),
      messageType: 'TEMPLATE',
      templateName: campaign.providerTemplateName,
      idempotencyKey: key,
      status: 'QUEUED',
      attempts: 1,
      at: Date.now(),
    });
    return { messageId, phone: customer.phone, params };
  },
});

export const finishTemplate = internalMutation({
  args: {
    campaignId: v.id('campaigns'),
    conversationId: v.id('conversations'),
    messageId: v.id('messages'),
    ok: v.boolean(),
    providerMessageId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const now = Date.now();
    const [conv, campaign] = await Promise.all([ctx.db.get(a.conversationId), ctx.db.get(a.campaignId)]);
    if (!conv || !campaign) return;
    await ctx.db.patch(a.messageId, { status: a.ok ? 'SENT' : 'FAILED', providerMessageId: a.providerMessageId, error: a.error, statusUpdatedAt: now });
    if (a.ok) {
      const msg = (await ctx.db.get(a.messageId))!;
      await ctx.db.patch(conv._id, {
        contactedAt: conv.contactedAt ?? now,
        outboundSent: conv.outboundSent + 1,
        lastMessageAt: now,
        lastMessagePreview: msg.body.slice(0, 140),
        lastMessageSender: 'SYSTEM',
      });
      if (conv.campaignCustomerId) await ctx.db.patch(conv.campaignCustomerId, { contactedAt: now });
      await transition(ctx, conv, 'MESSAGE_SENT', `Template ${campaign.providerTemplateName} sent`, 'system');
      await ctx.db.patch(campaign._id, { sent: (campaign.sent ?? 0) + 1 });
    } else {
      await ctx.db.patch(conv._id, { stateReason: a.error });
      await transition(ctx, conv, 'FAILED', a.error, 'system');
      await ctx.db.patch(campaign._id, { failed: (campaign.failed ?? 0) + 1, lastError: a.error });
    }
  },
});

export const complete = internalMutation({
  args: { campaignId: v.id('campaigns'), loopToken: v.string() },
  handler: async (ctx, { campaignId, loopToken }) => {
    const c = await ctx.db.get(campaignId);
    if (c?.status === 'RUNNING' && c.loopToken === loopToken) await ctx.db.patch(campaignId, { status: 'COMPLETED', completedAt: Date.now(), loopToken: undefined });
  },
});

export const autoPause = internalMutation({
  args: { campaignId: v.id('campaigns'), reason: v.string() },
  handler: async (ctx, { campaignId, reason }) => {
    const c = await ctx.db.get(campaignId);
    if (c?.status === 'RUNNING') await ctx.db.patch(campaignId, { status: 'PAUSED', pausedAt: Date.now(), loopToken: undefined, lastError: `Auto-paused: ${reason}` });
  },
});

/** Errors that would fail every send → stop the campaign instead of burning through the list. */
function isSystemic(httpStatus: number | null, error: string): boolean {
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) return true;
  return /template|api key|not configured|parameter|Model invalid/i.test(error) && !/number|recipient|not a valid whatsapp/i.test(error);
}

export const tick = internalAction({
  args: { campaignId: v.id('campaigns'), loopToken: v.string() },
  handler: async (ctx, { campaignId, loopToken }): Promise<string> => {
    const batch: Batch = await ctx.runQuery(internal.campaignRun.nextBatch, { campaignId, loopToken });
    if (batch.stop !== null) return batch.stop;
    if (batch.conversations.length === 0) {
      if (batch.enrollmentDone) {
        await ctx.runMutation(internal.campaignRun.complete, { campaignId, loopToken });
        return 'completed';
      }
      await ctx.scheduler.runAfter(5_000, internal.campaignRun.tick, { campaignId, loopToken }); // enrollment still running
      return 'waiting for enrollment';
    }
    const provider = getWhatsAppProvider();
    const gapMs = Math.floor(60_000 / batch.rate);
    const started = Date.now();
    for (const [i, conversationId] of batch.conversations.entries()) {
      // Re-check between sends so Pause takes effect within one message.
      if (i > 0) {
        const still: Batch = await ctx.runQuery(internal.campaignRun.nextBatch, { campaignId, loopToken });
        if (still.stop !== null) return still.stop;
        await new Promise((r) => setTimeout(r, Math.max(0, started + i * gapMs - Date.now())));
      }
      const r: Reserved = await ctx.runMutation(internal.campaignRun.reserveTemplate, { conversationId });
      if ('skip' in r) continue;
      let result;
      try {
        result = await provider.sendTemplate({ to: r.phone, templateName: batch.templateName, languageCode: batch.language, bodyParams: r.params });
      } catch (err) {
        result = { ok: false as const, retryable: false, error: err instanceof Error ? err.message : String(err), httpStatus: null, raw: null };
      }
      await ctx.runMutation(internal.campaignRun.finishTemplate, {
        campaignId,
        conversationId,
        messageId: r.messageId,
        ok: result.ok,
        providerMessageId: result.ok ? (result.providerMessageId ?? undefined) : undefined,
        error: result.ok ? undefined : result.error,
      });
      if (!result.ok && isSystemic(result.httpStatus, result.error)) {
        await ctx.runMutation(internal.campaignRun.autoPause, { campaignId, reason: result.error });
        return `auto-paused: ${result.error}`;
      }
    }
    await ctx.scheduler.runAfter(Math.max(0, started + 60_000 - Date.now()), internal.campaignRun.tick, { campaignId, loopToken });
    return `sent batch of ${batch.conversations.length}`;
  },
});
