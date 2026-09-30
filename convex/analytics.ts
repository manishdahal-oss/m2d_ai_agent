/**
 * Overview metrics, funnel and breakdowns.
 *
 * Convex has no SQL aggregates, so an action pages through the tables with internal queries
 * (2,000 docs per page) and aggregates in memory. Fine for hundreds of thousands of rows;
 * beyond that, switch to the @convex-dev/aggregate component for O(log n) counts.
 *
 * Funnel stages count *milestones* (contactedAt, firstReplyAt, …), not current state, and are
 * distinct customers. "Eligible" = eligible now + anyone already contacted (they were eligible
 * when messaged), so every stage is a subset of the one above.
 */
import { v } from 'convex/values';
import { ACTIVE_STATES, type ConversationState } from '../shared/conversationStates';
import type { AnalyticsResponse, FunnelStage } from '../shared/types';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalQuery } from './_generated/server';
import { authedAction as action } from './lib/access';

const PAGE = 2000;

// Explicit row types: the action calls internal.analytics.* from this same module, which would
// otherwise make TypeScript's inference circular.
type ConvRow = {
  campaignId: Id<'campaigns'>;
  customerId: Id<'customers'>;
  state: ConversationState;
  language: string | null;
  segment: string | null;
  contactedAt: number | null;
  firstReplyAt: number | null;
  interestedAt: number | null;
  linkSentAt: number | null;
  linkClickedAt: number | null;
  activatedAt: number | null;
  outboundSent: number;
  outboundDelivered: number;
  inboundCount: number;
};
type CustomerRow = { id: Id<'customers'>; eligibility: string; language: string | null; segment: string | null };
type EnrollmentRow = { campaignId: Id<'campaigns'>; customerId: Id<'customers'>; eligibility: 'ELIGIBLE' | 'EXCLUDED' };
const vCursor = v.union(v.string(), v.null());

export const scanConversations = internalQuery({
  args: { cursor: vCursor },
  handler: async (ctx, { cursor }) => {
    const r = await ctx.db.query('conversations').paginate({ cursor, numItems: PAGE });
    return {
      isDone: r.isDone,
      continueCursor: r.continueCursor,
      rows: r.page.map((c) => ({
        campaignId: c.campaignId,
        customerId: c.customerId,
        state: c.state,
        language: c.customerLanguage ?? null,
        segment: c.customerSegment ?? null,
        contactedAt: c.contactedAt ?? null,
        firstReplyAt: c.firstReplyAt ?? null,
        interestedAt: c.interestedAt ?? null,
        linkSentAt: c.linkSentAt ?? null,
        linkClickedAt: c.linkClickedAt ?? null,
        activatedAt: c.activatedAt ?? null,
        outboundSent: c.outboundSent,
        outboundDelivered: c.outboundDelivered,
        inboundCount: c.inboundCount,
      })),
    };
  },
});

export const scanCustomers = internalQuery({
  args: { cursor: vCursor },
  handler: async (ctx, { cursor }) => {
    const r = await ctx.db.query('customers').paginate({ cursor, numItems: PAGE });
    return {
      isDone: r.isDone,
      continueCursor: r.continueCursor,
      rows: r.page.map((c) => ({ id: c._id, eligibility: c.eligibility, language: c.language ?? null, segment: c.businessType ?? null })),
    };
  },
});

export const scanEnrollments = internalQuery({
  args: { cursor: vCursor },
  handler: async (ctx, { cursor }) => {
    const r = await ctx.db.query('campaignCustomers').paginate({ cursor, numItems: PAGE });
    return {
      isDone: r.isDone,
      continueCursor: r.continueCursor,
      rows: r.page.map((e) => ({ campaignId: e.campaignId, customerId: e.customerId, eligibility: e.eligibility })),
    };
  },
});

export const campaignNames = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query('campaigns').order('desc').take(200)).map((c) => ({ id: c._id, name: c.name })),
});

type Page<T> = { isDone: boolean; continueCursor: string; rows: T[] };
async function scanAll<T>(fetch: (cursor: string | null) => Promise<Page<T>>): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page: Page<T> = await fetch(cursor);
    out.push(...page.rows);
    if (page.isDone) return out;
    cursor = page.continueCursor;
  }
}

const MILESTONES = [
  ['contacted', 'Contacted', 'contactedAt'],
  ['replied', 'Replied', 'firstReplyAt'],
  ['interested', 'Interested', 'interestedAt'],
  ['linkSent', 'Desktop link sent', 'linkSentAt'],
  ['linkClicked', 'Link clicked', 'linkClickedAt'],
  ['activated', 'Desktop activated', 'activatedAt'],
] as const;

export const compute = action({
  args: {
    campaignId: v.optional(v.id('campaigns')),
    language: v.optional(v.string()),
    segment: v.optional(v.string()),
    from: v.optional(v.string()), // YYYY-MM-DD, applied to first-contact date
    to: v.optional(v.string()),
  },
  handler: async (ctx, filters): Promise<AnalyticsResponse> => {
    const [convs, customers, enrollments, campaigns]: [ConvRow[], CustomerRow[], EnrollmentRow[], Array<{ id: Id<'campaigns'>; name: string }>] =
      await Promise.all([
        scanAll<ConvRow>((cursor) => ctx.runQuery(internal.analytics.scanConversations, { cursor })),
        scanAll<CustomerRow>((cursor) => ctx.runQuery(internal.analytics.scanCustomers, { cursor })),
        scanAll<EnrollmentRow>((cursor) => ctx.runQuery(internal.analytics.scanEnrollments, { cursor })),
        ctx.runQuery(internal.analytics.campaignNames, {}),
      ]);

    /* ── Global overview metrics (unfiltered) ── */
    const activeSet = new Set<ConversationState>(ACTIVE_STATES);
    const metrics = {
      customersUploaded: customers.length,
      eligibleCustomers: customers.filter((c) => c.eligibility === 'ELIGIBLE').length,
      optedOut: customers.filter((c) => c.eligibility === 'OPTED_OUT').length,
      messagesSent: convs.reduce((s, c) => s + c.outboundSent, 0),
      delivered: convs.reduce((s, c) => s + c.outboundDelivered, 0),
      customerReplies: convs.reduce((s, c) => s + c.inboundCount, 0),
      activeConversations: convs.filter((c) => activeSet.has(c.state)).length,
      interested: convs.filter((c) => c.interestedAt !== null).length,
      linksSent: convs.filter((c) => c.linkSentAt !== null).length,
      linksClicked: convs.filter((c) => c.linkClickedAt !== null).length,
      activated: convs.filter((c) => c.activatedAt !== null).length,
      needsHuman: convs.filter((c) => c.state === 'NEEDS_HUMAN').length,
      notInterested: convs.filter((c) => c.state === 'NOT_INTERESTED').length,
    };

    /* ── Per-campaign stats ── */
    const campaignStats: AnalyticsResponse['campaignStats'] = {};
    const stat = (id: string) => (campaignStats[id] ??= { enrolled: 0, contacted: 0, replied: 0, interested: 0, linkSent: 0, activated: 0, needsHuman: 0 });
    for (const e of enrollments) stat(e.campaignId).enrolled++;
    for (const c of convs) {
      const s = stat(c.campaignId);
      if (c.contactedAt !== null) s.contacted++;
      if (c.firstReplyAt !== null) s.replied++;
      if (c.interestedAt !== null) s.interested++;
      if (c.linkSentAt !== null) s.linkSent++;
      if (c.activatedAt !== null) s.activated++;
      if (c.state === 'NEEDS_HUMAN') s.needsHuman++;
    }

    /* ── Filtered funnel ── */
    const fromMs = filters.from ? Date.parse(`${filters.from}T00:00:00+05:30`) : null; // dates are IST
    const toMs = filters.to ? Date.parse(`${filters.to}T00:00:00+05:30`) + 86_400_000 : null;
    const langOk = (l: string | null) => !filters.language || (filters.language === 'unknown' ? l === null : l === filters.language);
    const segOk = (s: string | null) => !filters.segment || s === filters.segment;

    const filteredConvs = convs.filter(
      (c) =>
        langOk(c.language) &&
        segOk(c.segment) &&
        (!filters.campaignId || c.campaignId === filters.campaignId) &&
        (fromMs === null || (c.contactedAt !== null && c.contactedAt >= fromMs)) &&
        (toMs === null || (c.contactedAt !== null && c.contactedAt < toMs)),
    );

    // Eligible population, per language.
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const eligibleByLang = new Map<string | null, number>();
    const addEligible = (lang: string | null) => eligibleByLang.set(lang, (eligibleByLang.get(lang) ?? 0) + 1);
    if (filters.campaignId) {
      for (const e of enrollments) {
        if (e.campaignId !== filters.campaignId || e.eligibility !== 'ELIGIBLE') continue;
        const c = customerById.get(e.customerId);
        if (c && langOk(c.language) && segOk(c.segment)) addEligible(c.language);
      }
    } else {
      const contacted = new Set<string>(convs.filter((c) => c.contactedAt !== null).map((c) => c.customerId));
      for (const c of customers) {
        if ((c.eligibility === 'ELIGIBLE' || contacted.has(c.id)) && langOk(c.language) && segOk(c.segment)) addEligible(c.language);
      }
    }
    const eligibleTotal = [...eligibleByLang.values()].reduce((a, b) => a + b, 0);

    const distinct = (rows: typeof convs, key: (typeof MILESTONES)[number][2]) => new Set(rows.filter((c) => c[key] !== null).map((c) => c.customerId)).size;
    const funnel: FunnelStage[] = [
      { key: 'eligible', label: 'Eligible', count: eligibleTotal },
      ...MILESTONES.map(([key, label, field]) => ({ key, label, count: distinct(filteredConvs, field) })),
    ];
    const activated = funnel[funnel.length - 1].count;

    const langs = new Set<string | null>([...eligibleByLang.keys(), ...filteredConvs.map((c) => c.language)]);
    const byLanguage = [...langs]
      .map((language) => {
        const rows = filteredConvs.filter((c) => c.language === language);
        return {
          language,
          eligible: eligibleByLang.get(language) ?? 0,
          contacted: distinct(rows, 'contactedAt'),
          replied: distinct(rows, 'firstReplyAt'),
          interested: distinct(rows, 'interestedAt'),
          activated: distinct(rows, 'activatedAt'),
        };
      })
      .sort((a, b) => b.eligible - a.eligible || b.contacted - a.contacted);

    const stateCounts = new Map<ConversationState, number>();
    for (const c of filteredConvs) stateCounts.set(c.state, (stateCounts.get(c.state) ?? 0) + 1);
    const byState = [...stateCounts].map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count);

    const segmentCounts = new Map<string, number>();
    for (const c of customers) if (c.segment) segmentCounts.set(c.segment, (segmentCounts.get(c.segment) ?? 0) + 1);

    return {
      filters,
      metrics,
      campaignStats,
      funnel,
      conversionRate: eligibleTotal ? activated / eligibleTotal : null,
      byLanguage,
      byState,
      options: {
        campaigns,
        languages: [...new Set(customers.flatMap((c) => (c.language ? [c.language] : [])))].sort(),
        segments: [...segmentCounts].sort((a, b) => b[1] - a[1]).slice(0, 50).map(([s]) => s),
      },
      computedAt: Date.now(),
    };
  },
});
