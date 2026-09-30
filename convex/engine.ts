/**
 * Conversation engine — inbound WhatsApp → state machine → reply.
 *
 *   webhook (HTTP) ──► recordWebhook (mutation: dedupe, store, ingest, schedule)
 *                        └─► respond (action, after debounce)
 *                              ├─ replyContext (query: skip rules, history, cap count)
 *                              ├─ rules: opt-out → cap/closing → human request → AI / fallback
 *                              ├─ reserveOutbound (mutation: idempotency key per inbound message)
 *                              ├─ provider.sendText (Times)
 *                              └─ finishOutbound (mutation: status, counters, state, ai_runs)
 */
import { ConvexError, v, type Infer } from 'convex/values';
import { canTransition, type ConversationState } from '../shared/conversationStates';
import { normalizePhone } from '../shared/customerImport/phone';
import { VYAPAR_DESKTOP_KNOWLEDGE } from '../shared/knowledge/vyaparDesktop';
import {
  capDecision,
  closingMessage,
  conversationLanguage,
  isAutoReply,
  isOptOut,
  isPersonal,
  isRepeat,
  optOutConfirmation,
  wantsHuman,
  type ReplyPolicyConfig,
} from '../shared/replyPolicy';
import type { InboundMessageEvent, StatusEvent, WebhookEvent } from '../shared/whatsappWebhook';
import { currentStep, desktopAnswer, deterministicStep, detectBusinessFrom, leaveReason, SOP, sopFallback } from '../shared/sop';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server';
import { runAgent, PROMPT_VERSION } from './ai/agent';
import { NvidiaLLMProvider } from './ai/nvidia';
import { authedAction } from './lib/access';
import { desktopDownloadUrl, engineConfig, nvidiaConfig } from './lib/config';
import { conversationSearchText, customerSearchText } from './lib/denormalize';
import { getWhatsAppProvider } from './whatsapp/index';

const PROVIDER = 'times';
const SYSTEM_CAMPAIGN = 'M2D WhatsApp — direct chats';

export function policy(): ReplyPolicyConfig {
  const e = engineConfig();
  return { messageLimit: e.messageLimit, helpline: e.helpline, desktopDownloadUrl: desktopDownloadUrl() };
}

/* ───────────────────────── Shared helpers ───────────────────────── */

export async function transition(ctx: MutationCtx, conv: Doc<'conversations'>, to: ConversationState, reason: string | undefined, actor: string) {
  if (conv.state === to) return conv.state;
  if (!canTransition(conv.state, to)) return conv.state;
  await ctx.db.insert('conversationEvents', { conversationId: conv._id, fromState: conv.state, toState: to, reason, actor, at: Date.now() });
  await ctx.db.patch(conv._id, { state: to, ...(to === 'NEEDS_HUMAN' ? { needsHumanAt: conv.needsHumanAt ?? Date.now(), needsHumanReason: reason } : {}) });
  await ctx.db.patch(conv.customerId, { latestState: to, latestConversationId: conv._id });
  return to;
}

async function systemCampaign(ctx: MutationCtx, name = SYSTEM_CAMPAIGN): Promise<Id<'campaigns'>> {
  const existing = (await ctx.db.query('campaigns').withIndex('by_system', (i) => i.eq('isSystem', true)).collect()).find((c) => c.name === name);
  if (existing) return existing._id;
  return ctx.db.insert('campaigns', {
    name,
    description: 'Auto-created for WhatsApp chats that did not start from a dashboard campaign.',
    segment: {},
    templateLanguage: 'en',
    status: 'RUNNING',
    sendRatePerMinute: 20,
    startedAt: Date.now(),
    isDemo: false,
    isSystem: true,
  });
}

async function upsertCustomerByPhone(ctx: MutationCtx, phone: string, name: string | null, source: 'inbound' | 'test'): Promise<Doc<'customers'>> {
  const existing = await ctx.db.query('customers').withIndex('by_phone', (i) => i.eq('phone', phone)).unique();
  if (existing) {
    if (!existing.name && name) {
      await ctx.db.patch(existing._id, { name, searchText: customerSearchText({ ...existing, name }) });
      return (await ctx.db.get(existing._id))!;
    }
    return existing;
  }
  const id = await ctx.db.insert('customers', {
    name: name ?? undefined,
    phone,
    attributes: {},
    eligibility: 'ELIGIBLE',
    lastActivityAt: Date.now(),
    searchText: customerSearchText({ name: name ?? undefined, phone }),
    isDemo: false,
    source,
  });
  return (await ctx.db.get(id))!;
}

async function latestConversation(ctx: QueryCtx, customerId: Id<'customers'>) {
  const convs = await ctx.db.query('conversations').withIndex('by_customer', (i) => i.eq('customerId', customerId)).collect();
  return convs.sort((a, b) => b.lastMessageAt - a.lastMessageAt)[0] ?? null;
}

export async function getOrCreateConversation(ctx: MutationCtx, customer: Doc<'customers'>, campaignId: Id<'campaigns'>, initial: ConversationState) {
  const existing = await ctx.db
    .query('conversations')
    .withIndex('by_campaign_customer', (i) => i.eq('campaignId', campaignId).eq('customerId', customer._id))
    .unique();
  if (existing) return existing;
  const now = Date.now();
  const id = await ctx.db.insert('conversations', {
    campaignId,
    customerId: customer._id,
    state: initial,
    aiPaused: false,
    lastMessageAt: now,
    customerName: customer.name,
    customerPhone: customer.phone,
    customerLanguage: customer.language,
    customerSegment: customer.businessType,
    outboundSent: 0,
    outboundDelivered: 0,
    inboundCount: 0,
    searchText: conversationSearchText({ customerName: customer.name, customerPhone: customer.phone }),
    isDemo: false,
  });
  await ctx.db.insert('conversationEvents', { conversationId: id, toState: initial, reason: 'Conversation started', actor: 'system', at: now });
  await ctx.db.patch(customer._id, { latestConversationId: id, latestState: initial, lastActivityAt: now });
  return (await ctx.db.get(id))!;
}

/* ───────────────────────── Webhook ingestion ───────────────────────── */

const STATUS_RANK: Record<string, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3 };

async function applyStatus(ctx: MutationCtx, e: StatusEvent): Promise<string> {
  const msg = await ctx.db.query('messages').withIndex('by_provider_message_id', (i) => i.eq('providerMessageId', e.providerMessageId)).first();
  if (!msg) return 'IGNORED';
  const next = e.status === 'failed' ? 'FAILED' : e.status === 'read' ? 'READ' : e.status === 'delivered' ? 'DELIVERED' : e.status === 'sent' ? 'SENT' : null;
  if (!next) return 'IGNORED';
  if (next !== 'FAILED' && (STATUS_RANK[next] ?? 0) <= (STATUS_RANK[msg.status] ?? 0)) return 'PROCESSED'; // never downgrade
  await ctx.db.patch(msg._id, { status: next, statusUpdatedAt: Date.now(), ...(e.error ? { error: e.error } : {}) });
  const wasDelivered = msg.status === 'DELIVERED' || msg.status === 'READ';
  if ((next === 'DELIVERED' || next === 'READ') && !wasDelivered) {
    const conv = await ctx.db.get(msg.conversationId);
    if (conv) await ctx.db.patch(conv._id, { outboundDelivered: conv.outboundDelivered + 1 });
  }
  return 'PROCESSED';
}

async function ingestMessage(ctx: MutationCtx, e: InboundMessageEvent): Promise<{ status: 'PROCESSED' | 'IGNORED'; messageId?: Id<'messages'>; error?: string }> {
  const phone = normalizePhone(e.from.startsWith('+') ? e.from : `+${e.from}`);
  if (!phone.ok) return { status: 'IGNORED', error: `Invalid sender: ${phone.reason}` };
  const dup = await ctx.db.query('messages').withIndex('by_provider_message_id', (i) => i.eq('providerMessageId', e.providerMessageId)).first();
  if (dup) return { status: 'IGNORED', error: 'Duplicate message' };

  const customer = await upsertCustomerByPhone(ctx, phone.e164, e.profileName, 'inbound');
  let conv = await latestConversation(ctx, customer._id);
  if (!conv) conv = await getOrCreateConversation(ctx, customer, await systemCampaign(ctx), 'CUSTOMER_REPLIED');

  // Order by when WE received it: WhatsApp timestamps are whole seconds, so a reply in the same
  // second as our template would otherwise sort before it. The provider time is kept in metadata.
  const at = Math.max(Date.now(), conv.lastMessageAt + 1);
  // A WhatsApp Business greeting/away message is not the customer replying.
  const autoReply = !!e.text && isAutoReply(e.text);
  const messageId = await ctx.db.insert('messages', {
    conversationId: conv._id,
    customerId: customer._id,
    direction: 'INBOUND',
    senderType: 'CUSTOMER',
    body: e.text || `[${e.messageType}]`,
    messageType: 'TEXT',
    providerMessageId: e.providerMessageId,
    status: 'RECEIVED',
    attempts: 0,
    metadata: { waType: e.messageType, providerTimestamp: e.timestamp, ...(autoReply ? { autoReply: true } : {}) },
    at,
  });
  await ctx.db.patch(conv._id, {
    lastMessageAt: Math.max(conv.lastMessageAt, at),
    lastInboundAt: at,
    inboundCount: conv.inboundCount + 1,
    firstReplyAt: autoReply ? conv.firstReplyAt : (conv.firstReplyAt ?? at),
    lastMessagePreview: (e.text || `[${e.messageType}]`).slice(0, 140),
    lastMessageSender: 'CUSTOMER',
    ...(!conv.customerName && customer.name ? { customerName: customer.name, searchText: conversationSearchText({ customerName: customer.name, customerPhone: customer.phone }) } : {}),
  });
  await ctx.db.patch(customer._id, { lastActivityAt: at, latestConversationId: conv._id });
  if (!autoReply && (conv.state === 'MESSAGE_SENT' || (conv.state === 'NOT_INTERESTED' && !conv.leftAt) || conv.state === 'NEW')) {
    await transition(ctx, conv, 'CUSTOMER_REPLIED', undefined, 'webhook');
  }
  return { status: 'PROCESSED', messageId };
}

/** Called by the HTTP webhook. Stores every event (dedup'd), ingests it, schedules replies. */
export const recordWebhook = internalMutation({
  args: { raw: v.any(), events: v.array(v.any()), headers: v.any() },
  handler: async (ctx, { raw, events, headers }) => {
    const parsed = events as WebhookEvent[];
    if (parsed.length === 0) {
      await ctx.db.insert('webhookEvents', {
        provider: PROVIDER,
        dedupeKey: `unparsed:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        eventType: 'unknown',
        payload: raw,
        headers,
        status: 'IGNORED',
        error: 'Unrecognised payload shape — stored for mapping',
        attempts: 1,
        processedAt: Date.now(),
      });
      return { received: 0, scheduled: 0 };
    }
    let scheduled = 0;
    for (const e of parsed) {
      const dedupeKey = e.kind === 'message' ? `message:${e.providerMessageId}` : `status:${e.providerMessageId}:${e.status}`;
      const seen = await ctx.db.query('webhookEvents').withIndex('by_provider_dedupe', (i) => i.eq('provider', PROVIDER).eq('dedupeKey', dedupeKey)).first();
      if (seen) continue; // provider retry — already handled
      const eventId = await ctx.db.insert('webhookEvents', { provider: PROVIDER, dedupeKey, eventType: e.kind, payload: { event: e, raw }, headers, status: 'RECEIVED', attempts: 1 });
      if (e.kind === 'status') {
        await ctx.db.patch(eventId, { status: (await applyStatus(ctx, e)) as 'PROCESSED' | 'IGNORED', processedAt: Date.now() });
        continue;
      }
      const r = await ingestMessage(ctx, e);
      await ctx.db.patch(eventId, { status: r.status, error: r.error, processedAt: Date.now() });
      if (r.messageId) {
        await ctx.scheduler.runAfter(engineConfig().replyDebounceMs, internal.engine.respond, { inboundMessageId: r.messageId });
        scheduled++;
      }
    }
    return { received: parsed.length, scheduled };
  },
});

/* ───────────────────────── Reply ───────────────────────── */

type ReplyContext =
  | { skip: string }
  | {
      skip: null;
      conversationId: Id<'conversations'>;
      customerId: Id<'customers'>;
      phone: string;
      text: string;
      state: ConversationState;
      outboundCount: number;
      customer: { name: string | null; businessType: string | null; city: string | null };
      history: Array<{ role: 'assistant' | 'user'; text: string }>;
    };

function unanswered(messages: Array<Doc<'messages'>>): string[] {
  const sorted = [...messages].sort((a, b) => a.at - b.at);
  const lastOut = sorted.filter((m) => m.direction === 'OUTBOUND').pop()?.at ?? 0;
  return sorted.filter((m) => m.direction === 'INBOUND' && m.at > lastOut && !m.metadata?.autoReply).map((m) => m.body);
}

export const replyContext = internalQuery({
  args: { inboundMessageId: v.id('messages') },
  handler: async (ctx, { inboundMessageId }): Promise<ReplyContext> => {
    const msg = await ctx.db.get(inboundMessageId);
    if (!msg) return { skip: 'message not found' };
    const conv = await ctx.db.get(msg.conversationId);
    const customer = await ctx.db.get(msg.customerId);
    if (!conv || !customer) return { skip: 'conversation not found' };

    const messages = await ctx.db.query('messages').withIndex('by_conversation', (i) => i.eq('conversationId', conv._id)).collect();
    const latestInbound = messages.filter((m) => m.direction === 'INBOUND' && !m.metadata?.autoReply).sort((a, b) => b.at - a.at || b._creationTime - a._creationTime)[0];
    if (latestInbound && latestInbound._id !== msg._id) return { skip: 'newer customer message will be answered instead (debounce)' };
    const already = await ctx.db.query('messages').withIndex('by_idempotency_key', (i) => i.eq('idempotencyKey', `reply:${msg._id}`)).first();
    if (already) return { skip: 'already replied' };

    const mode = engineConfig().autoReplyMode;
    if (mode === 'off') return { skip: 'auto-reply is off (AUTO_REPLY_MODE=off)' };
    if (mode === 'contacted') {
      const convs = await ctx.db.query('conversations').withIndex('by_customer', (i) => i.eq('customerId', customer._id)).collect();
      if (!convs.some((c) => c.contactedAt !== undefined)) return { skip: 'auto-reply only answers customers we messaged first (AUTO_REPLY_MODE=contacted)' };
    }
    if (mode === 'test_only') {
      const tested = await ctx.db.query('testSends').withIndex('by_to', (i) => i.eq('to', customer.phone)).first();
      if (!tested) return { skip: 'auto-reply is limited to test numbers (AUTO_REPLY_MODE=test_only)' };
    }
    if (customer.isDemo) return { skip: 'demo customer' };
    if (customer.eligibility === 'OPTED_OUT' || conv.state === 'STOPPED') return { skip: 'customer opted out' };
    if (conv.aiPaused) return { skip: 'a human has taken over' };
    if (conv.state === 'NEEDS_HUMAN') return { skip: 'waiting for a human' };
    if (conv.limitReachedAt) return { skip: 'message limit reached' };
    if (conv.leftAt) return { skip: 'customer was left (no business / no desktop) — no more messages' };

    const outbound = await ctx.db
      .query('messages')
      .withIndex('by_customer_direction', (i) => i.eq('customerId', customer._id).eq('direction', 'OUTBOUND'))
      .collect();
    return {
      skip: null,
      conversationId: conv._id,
      customerId: customer._id,
      phone: customer.phone,
      // Everything the customer wrote since our last message, answered together in one reply.
      text: unanswered(messages).join('\n') || msg.body,
      state: conv.state,
      outboundCount: outbound.filter((m) => m.status !== 'FAILED').length,
      customer: { name: customer.name ?? null, businessType: customer.businessType ?? null, city: customer.city ?? null },
      history: messages
        .filter((m) => !(m.direction === 'INBOUND' && m.metadata?.autoReply))
        .sort((a, b) => a.at - b.at)
        .map((m) => ({ role: m.direction === 'INBOUND' ? ('user' as const) : ('assistant' as const), text: m.body })),
    };
  },
});

const vAi = v.object({
  provider: v.string(),
  model: v.optional(v.string()),
  status: v.union(v.literal('SUCCEEDED'), v.literal('FAILED'), v.literal('FALLBACK')),
  intent: v.optional(v.string()),
  sentiment: v.optional(v.string()),
  stage: v.optional(v.string()),
  nextAction: v.optional(v.string()),
  confidence: v.optional(v.number()),
  inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
  latencyMs: v.optional(v.number()),
  error: v.optional(v.string()),
});

/** Insert the outbound reply as QUEUED. Returns null if this inbound message was already answered. */
export const reserveOutbound = internalMutation({
  args: { inboundMessageId: v.id('messages'), body: v.string(), senderType: v.union(v.literal('AI'), v.literal('SYSTEM')) },
  handler: async (ctx, { inboundMessageId, body, senderType }): Promise<Id<'messages'> | null> => {
    const key = `reply:${inboundMessageId}`;
    if (await ctx.db.query('messages').withIndex('by_idempotency_key', (i) => i.eq('idempotencyKey', key)).first()) return null;
    const inbound = await ctx.db.get(inboundMessageId);
    if (!inbound) throw new ConvexError('Inbound message not found');
    // The customer wrote again while we were composing: that message's run answers everything.
    const newer = await ctx.db
      .query('messages')
      .withIndex('by_conversation', (i) => i.eq('conversationId', inbound.conversationId).gt('at', inbound.at))
      .filter((q) => q.eq(q.field('direction'), 'INBOUND'))
      .collect();
    if (newer.some((m) => !m.metadata?.autoReply)) return null;
    return ctx.db.insert('messages', {
      conversationId: inbound.conversationId,
      customerId: inbound.customerId,
      direction: 'OUTBOUND',
      senderType,
      body,
      messageType: 'TEXT',
      idempotencyKey: key,
      status: 'QUEUED',
      attempts: 1,
      at: Date.now(),
    });
  },
});

export const finishOutbound = internalMutation({
  args: {
    messageId: v.id('messages'),
    inboundMessageId: v.id('messages'),
    ok: v.boolean(),
    providerMessageId: v.optional(v.string()),
    error: v.optional(v.string()),
    /** State to move to on success, and why. */
    nextState: v.optional(v.string()),
    reason: v.optional(v.string()),
    optOut: v.optional(v.boolean()),
    closing: v.optional(v.boolean()),
    linkSent: v.optional(v.boolean()),
    ai: v.optional(vAi),
    businessCategory: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const msg = (await ctx.db.get(a.messageId))!;
    const conv = (await ctx.db.get(msg.conversationId))!;
    const now = Date.now();
    await ctx.db.patch(a.messageId, {
      status: a.ok ? 'SENT' : 'FAILED',
      providerMessageId: a.providerMessageId,
      error: a.error,
      statusUpdatedAt: now,
    });
    if (a.ai) {
      await ctx.db.insert('aiRuns', { conversationId: conv._id, triggerMessageId: a.inboundMessageId, replyMessageId: a.messageId, promptVersion: PROMPT_VERSION, ...a.ai });
    }
    if (!a.ok) {
      await ctx.db.insert('conversationEvents', { conversationId: conv._id, fromState: conv.state, toState: conv.state, reason: `Reply failed: ${a.error}`, actor: 'system', at: now });
      return;
    }
    await ctx.db.patch(conv._id, {
      outboundSent: conv.outboundSent + 1,
      lastMessageAt: now,
      lastMessagePreview: msg.body.slice(0, 140),
      lastMessageSender: msg.senderType,
      ...(a.closing ? { limitReachedAt: now } : {}),
      ...(a.linkSent ? { linkSentAt: conv.linkSentAt ?? now, interestedAt: conv.interestedAt ?? now } : {}),
      ...(a.businessCategory ? { businessCategory: a.businessCategory } : {}),
    });
    let current = (await ctx.db.get(conv._id))!;
    // CUSTOMER_REPLIED → AI_CONVERSATION once we answer.
    if (current.state === 'CUSTOMER_REPLIED') {
      await transition(ctx, current, 'AI_CONVERSATION', undefined, 'ai');
      current = (await ctx.db.get(conv._id))!;
    }
    if (a.optOut) {
      await ctx.db.patch(conv.customerId, { eligibility: 'OPTED_OUT', optedOutAt: now, optOutSource: 'whatsapp' });
      await ctx.db.patch(conv._id, { stoppedAt: now });
      await transition(ctx, current, 'STOPPED', 'Customer asked not to be contacted', 'webhook');
      return;
    }
    const target = (a.linkSent ? 'DESKTOP_LINK_SENT' : a.nextState) as ConversationState | undefined;
    if (target && target !== current.state) {
      if (target === 'INTERESTED') await ctx.db.patch(conv._id, { interestedAt: current.interestedAt ?? now });
      if (target === 'NOT_INTERESTED') await ctx.db.patch(conv._id, { notInterestedAt: current.notInterestedAt ?? now });
      await transition(ctx, current, target, a.reason, 'ai');
    }
    if (a.closing) {
      await ctx.db.insert('conversationEvents', { conversationId: conv._id, fromState: current.state, toState: (await ctx.db.get(conv._id))!.state, reason: 'Message limit reached — closing message sent', actor: 'system', at: now });
    }
  },
});

export const markLimitReached = internalMutation({
  args: { conversationId: v.id('conversations') },
  handler: async (ctx, { conversationId }) => {
    const conv = await ctx.db.get(conversationId);
    if (conv && !conv.limitReachedAt) await ctx.db.patch(conversationId, { limitReachedAt: Date.now() });
  },
});

/** Customer flag: has a desktop/laptop (YES/NO); the latest answer wins. */
export const setHasDesktop = internalMutation({
  args: { customerId: v.id('customers'), value: v.union(v.literal('YES'), v.literal('NO')) },
  handler: async (ctx, { customerId, value }) => {
    const c = await ctx.db.get(customerId);
    if (c && c.hasDesktop !== value) await ctx.db.patch(customerId, { hasDesktop: value, hasDesktopAt: Date.now() });
  },
});

/** Stop all automated messages to this customer (said no business / no desktop). */
export const leaveCustomer = internalMutation({
  args: { conversationId: v.id('conversations'), reason: v.string() },
  handler: async (ctx, { conversationId, reason }) => {
    const conv = await ctx.db.get(conversationId);
    if (!conv || conv.leftAt) return;
    const now = Date.now();
    await ctx.db.patch(conversationId, { leftAt: now, notInterestedAt: conv.notInterestedAt ?? now });
    await transition(ctx, conv, 'NOT_INTERESTED', reason, 'system');
  },
});

export const recordSkip = internalMutation({
  args: { inboundMessageId: v.id('messages'), reason: v.string() },
  handler: async (ctx, { inboundMessageId, reason }) => {
    const m = await ctx.db.get(inboundMessageId);
    if (m) await ctx.db.patch(inboundMessageId, { metadata: { ...(m.metadata ?? {}), replySkipped: reason } });
  },
});

type RespondResult = { sent: boolean; reason: string };

type Composed =
  | { kind: 'skip'; reason: string; markLimit?: boolean; silentOptOut?: boolean; leave?: boolean; hasDesktop?: 'YES' | 'NO' }
  | {
      kind: 'send';
      body: string;
      senderType: 'AI' | 'SYSTEM';
      nextState?: string;
      reason?: string;
      optOut: boolean;
      closing: boolean;
      ai?: Infer<typeof vAi>;
      businessCategory?: string;
      source: 'rule' | 'sop' | 'ai' | 'fallback';
      hasDesktop?: 'YES' | 'NO';
    };

const hostOf = (url: string | null) => (url ? url.replace(/^https?:\/\//, '').replace(/\/+$/, '') : 'vyaparapp.in');

/**
 * Decide the next message — shared by live replies and the Settings preview.
 * Order: opt-out → message cap → talk to a person → exact SOP steps → AI (with SOP) → SOP fallback,
 * then repeat protection and the first-reply greeting.
 */
export async function composeReply(i: Parameters<typeof composeInner>[0]): Promise<Composed> {
  const r = await composeInner(i);
  const lastOut = i.history.filter((h) => h.role === 'assistant').pop()?.text;
  // The AI may also recognise "no desktop" in wordings our rules don't know.
  const flag = desktopAnswer(i.text, lastOut) ?? (r.kind === 'skip' && r.leave && /no desktop/.test(r.reason) ? 'NO' : null);
  return flag ? { ...r, hasDesktop: flag } : r;
}

async function composeInner(i: {
  text: string;
  history: Array<{ role: 'assistant' | 'user'; text: string }>;
  customer: { name: string | null; businessType: string | null; city: string | null };
  outboundCount: number;
}): Promise<Composed> {
  const pol = policy();
  const lang = conversationLanguage(i.text, i.history);
  const sopCfg = { helpline: pol.helpline, downloadHost: hostOf(pol.desktopDownloadUrl) };
  const base = { optOut: false, closing: false } as const;

  if (isAutoReply(i.text)) return { kind: 'skip', reason: "business auto-reply (greeting/away message) — waiting for the customer's own message" };

  if (isPersonal(i.text)) return { kind: 'skip', reason: 'personal message — not answered' };

  const cap = capDecision(i.outboundCount, pol);
  if (isOptOut(i.text)) {
    if (cap === 'blocked') return { kind: 'skip', reason: 'opt-out recorded (limit reached)', silentOptOut: true };
    return { kind: 'send', ...base, body: optOutConfirmation(lang), senderType: 'SYSTEM', optOut: true, source: 'rule' };
  }
  if (cap === 'blocked') return { kind: 'skip', reason: 'message limit reached', markLimit: true };
  if (cap === 'closing') {
    return { kind: 'send', ...base, body: closingMessage(lang, pol), senderType: 'SYSTEM', closing: true, nextState: pol.desktopDownloadUrl ? 'DESKTOP_LINK_SENT' : undefined, source: 'rule' };
  }
  if (wantsHuman(i.text)) {
    return { kind: 'send', ...base, body: SOP.person(lang, sopCfg), senderType: 'SYSTEM', nextState: 'NEEDS_HUMAN', reason: 'Customer requested assistance.', source: 'rule' };
  }

  const previous = i.history.filter((h) => h.role === 'assistant').map((h) => h.text);
  const lastOut = previous[previous.length - 1];
  const isFirstReply = previous.length <= 1; // only the template so far
  const customerMsgs = i.history.filter((h) => h.role === 'user').map((h) => h.text).reverse();
  const detected = detectBusinessFrom(customerMsgs.length ? customerMsgs : [i.text]);
  const step = currentStep(lastOut);

  let body: string;
  let nextState: string | undefined;
  let reason: string | undefined;
  let ai: Infer<typeof vAi> | undefined;
  let businessCategory = detected?.key;
  let source: 'sop' | 'ai' | 'fallback';

  const leave = leaveReason(i.text, lastOut);
  if (leave) return { kind: 'skip', reason: leave, leave: true };

  const det = deterministicStep(i.text, lastOut, lang, sopCfg);
  if (det) {
    body = det.text;
    nextState = det.stage;
    source = 'sop';
    ai = { provider: 'sop', model: 'M2D SOP', status: 'SUCCEEDED', intent: det.intent, stage: det.stage, nextAction: `SOP step → ${det.step}` };
  } else {
    const nv = nvidiaConfig();
    let error: string | undefined;
    let out: Awaited<ReturnType<typeof runAgent>> | null = null;
    if (nv.apiKey) {
      try {
        out = await runAgent(new NvidiaLLMProvider(nv), {
          customer: i.customer,
          history: i.history,
          language: lang,
          remainingAfterThis: Math.max(0, pol.messageLimit - i.outboundCount - 2),
          isFirstReply,
          knowledge: VYAPAR_DESKTOP_KNOWLEDGE,
          policy: pol,
          business: detected,
          step,
          downloadHost: sopCfg.downloadHost,
        });
        if (!out.output) error = 'Model output was not valid JSON';
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
    }
    if (out?.output?.personal) return { kind: 'skip', reason: 'personal message — not answered (AI)' };
    if (out?.output?.noDesktop) return { kind: 'skip', reason: 'Customer has no desktop/laptop or wants only the mobile app (AI) — left, no reply sent', leave: true };
    if (out?.output) {
      const o = out.output;
      // Keep the SOP business question word-for-word even if the model garbles it.
      body = o.reply.replace(/Aapka kis cheez ka business[^?]*\?\s*Bata dijiye[^.]*main aapko batati hoon\./i, SOP.askBusiness('hinglish'));
      nextState = o.stage;
      reason = o.stage === 'NEEDS_HUMAN' ? 'AI could not answer confidently from approved information.' : undefined;
      businessCategory = o.businessCategory ?? businessCategory;
      source = 'ai';
      ai = {
        provider: 'nvidia',
        model: out.result.model,
        status: 'SUCCEEDED',
        intent: o.intent,
        sentiment: o.sentiment,
        stage: o.stage,
        nextAction: o.nextAction,
        confidence: o.confidence,
        inputTokens: out.result.inputTokens ?? undefined,
        outputTokens: out.result.outputTokens ?? undefined,
        latencyMs: out.result.latencyMs,
      };
    } else {
      const f = sopFallback(i.text, customerMsgs, lastOut, lang, sopCfg);
      body = f.text;
      nextState = f.stage;
      source = 'fallback';
      ai = { provider: nv.apiKey ? 'nvidia' : 'sop', model: nv.apiKey ? nv.model : 'M2D SOP', status: 'FALLBACK', intent: f.intent, stage: f.stage, nextAction: `SOP step → ${f.step}`, error };
    }
  }

  // Never send the same message twice: try the SOP's next step instead; if that repeats too, stay quiet.
  if (isRepeat(body, previous)) {
    const alt = sopFallback(i.text, customerMsgs, lastOut, lang, sopCfg).text;
    if (isRepeat(alt, previous)) return { kind: 'skip', reason: 'the only possible reply would repeat an earlier message' };
    body = alt;
    if (ai) ai = { ...ai, nextAction: `${ai.nextAction ?? ''} (repeat replaced)`.trim() };
  }
  if (isFirstReply && !/^namaste/i.test(body)) body = `Namaste Sir\n\n${body}`;

  return { kind: 'send', ...base, body, senderType: 'AI', nextState, reason, ai, businessCategory, source };
}

export const respond = internalAction({
  args: { inboundMessageId: v.id('messages') },
  handler: async (ctx, { inboundMessageId }): Promise<RespondResult> => {
    const c: ReplyContext = await ctx.runQuery(internal.engine.replyContext, { inboundMessageId });
    if (c.skip !== null) {
      await ctx.runMutation(internal.engine.recordSkip, { inboundMessageId, reason: c.skip });
      return { sent: false, reason: c.skip };
    }
    const r = await composeReply({ text: c.text, history: c.history, customer: c.customer, outboundCount: c.outboundCount });
    if (r.hasDesktop) await ctx.runMutation(internal.engine.setHasDesktop, { customerId: c.customerId, value: r.hasDesktop });
    if (r.kind === 'skip') {
      if (r.silentOptOut) {
        const id = await ctx.runMutation(internal.engine.reserveOutbound, { inboundMessageId, body: '(opt-out recorded, no message sent — limit reached)', senderType: 'SYSTEM' });
        if (id) await ctx.runMutation(internal.engine.finishOutbound, { messageId: id, inboundMessageId, ok: false, error: 'Not sent: message limit reached', optOut: true });
      } else {
        if (r.markLimit) await ctx.runMutation(internal.engine.markLimitReached, { conversationId: c.conversationId });
        if (r.leave) await ctx.runMutation(internal.engine.leaveCustomer, { conversationId: c.conversationId, reason: r.reason });
        await ctx.runMutation(internal.engine.recordSkip, { inboundMessageId, reason: r.reason });
      }
      return { sent: false, reason: r.reason };
    }

    const messageId = await ctx.runMutation(internal.engine.reserveOutbound, { inboundMessageId, body: r.body, senderType: r.senderType });
    if (!messageId) return { sent: false, reason: 'already replied' };

    let result;
    try {
      result = await getWhatsAppProvider().sendText({ to: c.phone, text: r.body });
    } catch (err) {
      result = { ok: false as const, retryable: false, error: err instanceof Error ? err.message : String(err), httpStatus: null, raw: null };
    }
    const host = hostOf(policy().desktopDownloadUrl);
    const linkSent = r.body.includes(host);
    await ctx.runMutation(internal.engine.finishOutbound, {
      messageId,
      inboundMessageId,
      ok: result.ok,
      providerMessageId: result.ok ? (result.providerMessageId ?? undefined) : undefined,
      error: result.ok ? undefined : result.error,
      nextState: r.nextState,
      reason: r.reason,
      optOut: r.optOut,
      closing: r.closing,
      linkSent,
      ai: r.ai,
      businessCategory: r.businessCategory,
    });
    return result.ok ? { sent: true, reason: r.closing ? 'closing message' : r.optOut ? 'opt-out confirmation' : r.source } : { sent: false, reason: `send failed: ${result.error}` };
  },
});

/**
 * A Settings test send becomes a real conversation: the customer (you) + the template message,
 * so the reply from that phone lands in a conversation with context.
 */
export const recordTestConversation = internalMutation({
  args: {
    to: v.string(),
    templateName: v.string(),
    templateText: v.optional(v.string()),
    providerMessageId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const customer = await upsertCustomerByPhone(ctx, a.to, null, 'test');
    const conv = await getOrCreateConversation(ctx, customer, await systemCampaign(ctx, 'Test conversations (Settings)'), 'NEW');
    const now = Date.now();
    const body = a.templateText?.trim() || `[Template: ${a.templateName}]`;
    await ctx.db.insert('messages', {
      conversationId: conv._id,
      customerId: customer._id,
      direction: 'OUTBOUND',
      senderType: 'SYSTEM',
      body,
      messageType: 'TEMPLATE',
      templateName: a.templateName,
      providerMessageId: a.providerMessageId,
      status: 'SENT',
      attempts: 1,
      at: now,
    });
    await ctx.db.patch(conv._id, {
      outboundSent: conv.outboundSent + 1,
      contactedAt: conv.contactedAt ?? now,
      lastMessageAt: now,
      lastMessagePreview: body.slice(0, 140),
      lastMessageSender: 'SYSTEM',
      // A new test re-opens a finished test chat so the flow can be tried again.
      limitReachedAt: undefined,
      leftAt: undefined,
    });
    const fresh = (await ctx.db.get(conv._id))!;
    if (fresh.state === 'NEW' || fresh.state === 'FAILED') await transition(ctx, fresh, 'MESSAGE_SENT', 'Test template sent from Settings', 'system');
    return conv._id;
  },
});

type PreviewResult = {
  reply: string;
  source: 'rule' | 'sop' | 'ai' | 'fallback' | 'none';
  rule?: string;
  intent?: string;
  stage?: string;
  nextAction?: string;
  confidence?: number;
  model?: string;
  latencyMs?: number;
  error?: string;
  businessCategory?: string;
};

/**
 * Settings → "Preview the agent": exactly what the live agent would answer (same composeReply),
 * but NEVER sends anything or writes to the database.
 */
export const previewReply = authedAction({
  args: {
    text: v.string(),
    /** Previous turns, oldest first (optional). */
    history: v.optional(v.array(v.object({ role: v.union(v.literal('assistant'), v.literal('user')), text: v.string() }))),
    /** Pretend this many messages were already sent to the customer (to preview the cap). */
    alreadySent: v.optional(v.number()),
  },
  handler: async (_ctx, { text, history = [], alreadySent }): Promise<PreviewResult> => {
    const msg = text.trim().slice(0, 1000);
    if (!msg) throw new ConvexError('Type a customer message to preview.');
    const convo = [...history.slice(-14), { role: 'user' as const, text: msg }];
    const sent = alreadySent ?? history.filter((h) => h.role === 'assistant').length;
    const r = await composeReply({ text: msg, history: convo, customer: { name: null, businessType: null, city: null }, outboundCount: sent });
    if (r.kind === 'skip') return { reply: `(nothing sent — ${r.reason})`, source: 'none', rule: r.reason };
    return {
      reply: r.body,
      source: r.source,
      rule: r.source === 'rule' ? (r.optOut ? 'Opt-out → customer is opted out permanently' : r.closing ? 'Message limit → closing message' : r.reason) : undefined,
      intent: r.ai?.intent,
      stage: r.nextState,
      nextAction: r.ai?.nextAction,
      confidence: r.ai?.confidence,
      model: r.ai?.model,
      latencyMs: r.ai?.latencyMs,
      error: r.ai?.error,
      businessCategory: r.businessCategory,
    };
  },
});
