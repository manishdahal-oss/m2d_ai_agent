/**
 * Convex schema — Vyapar M2D WhatsApp Agent.
 *
 * Convex has no UNIQUE constraints: uniqueness (phone, provider message id, idempotency key,
 * webhook dedupe key) is enforced in mutations via these indexes. Mutations are serializable
 * transactions, so check-then-insert is race-free.
 */
import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  vCampaignStatus,
  vConversationState,
  vEligibility,
  vExclusionReason,
  vImportStats,
  vMessageDirection,
  vMessageStatus,
  vSenderType,
} from './lib/validators';

export default defineSchema({
  // Convex Auth: users, sessions, accounts, refresh tokens, rate limits.
  ...authTables,

  importBatches: defineTable({
    filename: v.string(),
    importedBy: v.optional(v.id('users')), // audit: who uploaded the file
    status: v.union(v.literal('IN_PROGRESS'), v.literal('COMPLETED')),
    stats: v.optional(vImportStats),
    columns: v.array(v.object({ source: v.string(), target: v.union(v.string(), v.null()) })),
    issues: v.array(v.object({ row: v.number(), phone: v.union(v.string(), v.null()), name: v.union(v.string(), v.null()), reason: v.string() })),
    inserted: v.number(),
    updated: v.number(),
    skipped: v.number(),
  }),

  customers: defineTable({
    externalId: v.optional(v.string()), // Vyapar customer_id
    name: v.optional(v.string()),
    phone: v.string(), // E.164, unique
    phoneRaw: v.optional(v.string()),
    whatsappId: v.optional(v.string()),
    language: v.optional(v.string()), // ISO 639-1
    city: v.optional(v.string()),
    businessType: v.optional(v.string()),
    plan: v.optional(v.string()),
    mobileUsage: v.optional(v.string()),
    assignedAgent: v.optional(v.string()),
    desktopStatus: v.optional(v.string()),
    attributes: v.record(v.string(), v.string()), // extra CSV columns
    /** 'ELIGIBLE' or the exclusion reason — a plain string so it can be indexed. */
    eligibility: vEligibility,
    optedOutAt: v.optional(v.number()),
    optOutSource: v.optional(v.string()),
    lastImportId: v.optional(v.id('importBatches')),
    /** Denormalised from the latest conversation for list filtering/sorting. */
    latestConversationId: v.optional(v.id('conversations')),
    latestState: v.optional(vConversationState),
    lastActivityAt: v.number(),
    /** name + phone digits + external id + city, for full-text search. */
    searchText: v.string(),
    isDemo: v.boolean(),
    /** Has a desktop/laptop, from the chat. Undefined = unconfirmed. */
    hasDesktop: v.optional(v.union(v.literal('YES'), v.literal('NO'))),
    hasDesktopAt: v.optional(v.number()),
    /** How the customer got here: CSV import, first messaged us, a Settings test send, or demo. */
    source: v.optional(v.union(v.literal('import'), v.literal('inbound'), v.literal('test'), v.literal('demo'))),
  })
    .index('by_phone', ['phone'])
    .index('by_external_id', ['externalId'])
    .index('by_whatsapp_id', ['whatsappId'])
    .index('by_activity', ['lastActivityAt'])
    .index('by_eligibility_activity', ['eligibility', 'lastActivityAt'])
    .index('by_language_activity', ['language', 'lastActivityAt'])
    .index('by_state_activity', ['latestState', 'lastActivityAt'])
    .index('by_demo', ['isDemo'])
    .searchIndex('search', { searchField: 'searchText', filterFields: ['eligibility', 'language', 'latestState'] }),

  campaigns: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    segment: v.any(), // target filter, e.g. { languages: ['en','hi'] }
    aiInstructions: v.optional(v.string()),
    messageTemplate: v.optional(v.string()), // body with {{variables}}
    providerTemplateName: v.optional(v.string()), // WhatsApp-approved template at Times
    templateLanguage: v.string(),
    desktopDownloadUrl: v.optional(v.string()),
    status: vCampaignStatus,
    sendRatePerMinute: v.number(),
    startedAt: v.optional(v.number()),
    pausedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    isDemo: v.boolean(),
    /** Auto-created container for chats that didn't start from a campaign (inbound / tests). */
    isSystem: v.optional(v.boolean()),
    // ── Sending (dashboard campaigns) ──
    /** Values for the template's {{1}}, {{2}}… — may use {{name}}, {{city}}, {{business_type}}. */
    templateParams: v.optional(v.array(v.string())),
    createdBy: v.optional(v.id('users')),
    enrolled: v.optional(v.number()),
    sent: v.optional(v.number()),
    failed: v.optional(v.number()),
    enrollmentDone: v.optional(v.boolean()),
    /** Changes on every start/resume so only one send loop is ever active. */
    loopToken: v.optional(v.string()),
    lastError: v.optional(v.string()),
  })
    .index('by_demo', ['isDemo'])
    .index('by_system', ['isSystem']),

  campaignCustomers: defineTable({
    campaignId: v.id('campaigns'),
    customerId: v.id('customers'),
    eligibility: v.union(v.literal('ELIGIBLE'), v.literal('EXCLUDED')),
    exclusionReason: v.optional(vExclusionReason),
    contactedAt: v.optional(v.number()),
  })
    .index('by_campaign_customer', ['campaignId', 'customerId'])
    .index('by_customer', ['customerId']),

  conversations: defineTable({
    campaignId: v.id('campaigns'),
    customerId: v.id('customers'),
    campaignCustomerId: v.optional(v.id('campaignCustomers')),
    state: vConversationState,
    stateReason: v.optional(v.string()),
    needsHumanReason: v.optional(v.string()),
    summary: v.optional(v.string()),
    aiPaused: v.boolean(),
    assignedHuman: v.optional(v.string()),
    // Funnel milestones: set once, never cleared (analytics don't depend on current state).
    contactedAt: v.optional(v.number()),
    firstReplyAt: v.optional(v.number()),
    interestedAt: v.optional(v.number()),
    linkSentAt: v.optional(v.number()),
    linkClickedAt: v.optional(v.number()),
    installationStartedAt: v.optional(v.number()),
    activatedAt: v.optional(v.number()),
    notInterestedAt: v.optional(v.number()),
    stoppedAt: v.optional(v.number()),
    needsHumanAt: v.optional(v.number()),
    /** Business type identified in the chat (SOP mapping key, e.g. "retail", "pharmacy"). */
    businessCategory: v.optional(v.string()),
    /** Customer reached the per-customer message cap; no more automated messages. */
    limitReachedAt: v.optional(v.number()),
    /** Customer said no business / no desktop-laptop: we stopped messaging them (owner rule). */
    leftAt: v.optional(v.number()),
    lastMessageAt: v.number(),
    lastInboundAt: v.optional(v.number()), // WhatsApp 24h customer-service window
    // Denormalised for lists / analytics without per-row joins.
    customerName: v.optional(v.string()),
    customerPhone: v.string(),
    customerLanguage: v.optional(v.string()),
    customerSegment: v.optional(v.string()),
    lastMessagePreview: v.optional(v.string()),
    lastMessageSender: v.optional(vSenderType),
    outboundSent: v.number(),
    outboundDelivered: v.number(),
    inboundCount: v.number(),
    searchText: v.string(),
    isDemo: v.boolean(),
  })
    .index('by_customer', ['customerId'])
    .index('by_campaign_customer', ['campaignId', 'customerId'])
    .index('by_last_message', ['lastMessageAt'])
    .index('by_state_last_message', ['state', 'lastMessageAt'])
    .index('by_state_needs_human', ['state', 'needsHumanAt'])
    .index('by_campaign_last_message', ['campaignId', 'lastMessageAt'])
    .index('by_campaign_state_last_message', ['campaignId', 'state', 'lastMessageAt'])
    .searchIndex('search', { searchField: 'searchText', filterFields: ['state', 'campaignId'] }),

  conversationEvents: defineTable({
    conversationId: v.id('conversations'),
    fromState: v.optional(vConversationState),
    toState: vConversationState,
    reason: v.optional(v.string()),
    actor: v.string(), // 'system' | 'ai' | 'human:<name>' | 'webhook' | 'demo'
    at: v.number(),
  }).index('by_conversation', ['conversationId', 'at']),

  messages: defineTable({
    conversationId: v.id('conversations'),
    customerId: v.id('customers'),
    direction: vMessageDirection,
    senderType: vSenderType,
    body: v.string(),
    messageType: v.union(v.literal('TEXT'), v.literal('TEMPLATE')),
    templateName: v.optional(v.string()),
    providerMessageId: v.optional(v.string()), // unique (enforced in mutations)
    idempotencyKey: v.optional(v.string()), // unique — duplicate-send protection
    status: vMessageStatus,
    error: v.optional(v.string()),
    attempts: v.number(),
    metadata: v.optional(v.any()),
    at: v.number(),
    statusUpdatedAt: v.optional(v.number()),
  })
    .index('by_conversation', ['conversationId', 'at'])
    .index('by_customer_direction', ['customerId', 'direction'])
    .index('by_provider_message_id', ['providerMessageId'])
    .index('by_idempotency_key', ['idempotencyKey']),

  aiRuns: defineTable({
    conversationId: v.id('conversations'),
    triggerMessageId: v.optional(v.id('messages')),
    replyMessageId: v.optional(v.id('messages')),
    provider: v.string(),
    model: v.optional(v.string()),
    promptVersion: v.optional(v.string()),
    status: v.union(v.literal('SUCCEEDED'), v.literal('FAILED'), v.literal('FALLBACK')),
    // Structured, display-safe metadata. Chain-of-thought is never stored.
    intent: v.optional(v.string()),
    sentiment: v.optional(v.string()),
    stage: v.optional(v.string()),
    nextAction: v.optional(v.string()),
    confidence: v.optional(v.number()),
    output: v.optional(v.any()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index('by_conversation', ['conversationId'])
    .index('by_reply_message', ['replyMessageId']),

  webhookEvents: defineTable({
    provider: v.string(),
    dedupeKey: v.string(), // provider event/message id → idempotency
    eventType: v.optional(v.string()),
    payload: v.any(),
    headers: v.any(),
    signatureValid: v.optional(v.boolean()),
    status: v.union(v.literal('RECEIVED'), v.literal('PROCESSED'), v.literal('IGNORED'), v.literal('FAILED')),
    error: v.optional(v.string()),
    attempts: v.number(),
    processedAt: v.optional(v.number()),
  }).index('by_provider_dedupe', ['provider', 'dedupeKey']),

  /** Audit trail for manual "send test message" calls from Settings. */
  testSends: defineTable({
    requestedBy: v.id('users'),
    to: v.string(), // E.164
    templateName: v.string(),
    languageCode: v.string(),
    bodyParams: v.array(v.string()),
    /** What the template says — stored on the conversation so the AI knows what the customer saw. */
    templateText: v.optional(v.string()),
    status: v.union(v.literal('QUEUED'), v.literal('SENT'), v.literal('FAILED')),
    provider: v.string(),
    providerMessageId: v.optional(v.string()),
    httpStatus: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index('by_user', ['requestedBy'])
    .index('by_to', ['to']),

  trackedLinks: defineTable({
    token: v.string(),
    conversationId: v.id('conversations'),
    targetUrl: v.string(),
    clicks: v.number(),
    firstClickedAt: v.optional(v.number()),
    lastClickedAt: v.optional(v.number()),
  }).index('by_token', ['token']),
});
