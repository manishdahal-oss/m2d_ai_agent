import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { authedQuery as query } from './lib/access';
import { vConversationState } from './lib/validators';

async function withCampaignNames(ctx: QueryCtx, rows: Doc<'conversations'>[]) {
  const names = new Map<Id<'campaigns'>, string>();
  for (const r of rows) if (!names.has(r.campaignId)) names.set(r.campaignId, (await ctx.db.get(r.campaignId))?.name ?? 'Unknown campaign');
  return rows.map((r) => ({ ...r, campaignName: names.get(r.campaignId)! }));
}

/**
 * Live, paginated conversations. The Needs Human queue is oldest-waiting first;
 * everything else is most-recent first.
 */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    state: v.optional(vConversationState),
    campaignId: v.optional(v.id('campaigns')),
    q: v.optional(v.string()),
  },
  handler: async (ctx, { paginationOpts, state, campaignId, q }) => {
    const term = q?.trim();
    let result;
    if (term) {
      result = await ctx.db
        .query('conversations')
        .withSearchIndex('search', (s) => {
          let x = s.search('searchText', term.replace(/^\+/, ''));
          if (state) x = x.eq('state', state);
          if (campaignId) x = x.eq('campaignId', campaignId);
          return x;
        })
        .paginate(paginationOpts);
    } else if (campaignId && state) {
      result = await ctx.db
        .query('conversations')
        .withIndex('by_campaign_state_last_message', (i) => i.eq('campaignId', campaignId).eq('state', state))
        .order('desc')
        .paginate(paginationOpts);
    } else if (campaignId) {
      result = await ctx.db
        .query('conversations')
        .withIndex('by_campaign_last_message', (i) => i.eq('campaignId', campaignId))
        .order('desc')
        .paginate(paginationOpts);
    } else if (state === 'NEEDS_HUMAN') {
      result = await ctx.db
        .query('conversations')
        .withIndex('by_state_needs_human', (i) => i.eq('state', 'NEEDS_HUMAN'))
        .order('asc')
        .paginate(paginationOpts);
    } else if (state) {
      result = await ctx.db
        .query('conversations')
        .withIndex('by_state_last_message', (i) => i.eq('state', state))
        .order('desc')
        .paginate(paginationOpts);
    } else {
      result = await ctx.db.query('conversations').withIndex('by_last_message').order('desc').paginate(paginationOpts);
    }
    return { ...result, page: await withCampaignNames(ctx, result.page) };
  },
});

const NEEDS_HUMAN_CAP = 500;

/** Live count for the sidebar badge / overview banner (capped; the queue should stay small). */
export const needsHumanCount = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('conversations')
      .withIndex('by_state_needs_human', (i) => i.eq('state', 'NEEDS_HUMAN'))
      .take(NEEDS_HUMAN_CAP + 1);
    return { count: Math.min(rows.length, NEEDS_HUMAN_CAP), capped: rows.length > NEEDS_HUMAN_CAP };
  },
});

/** Oldest-waiting Needs Human conversations, for the overview panel. */
export const needsHumanPreview = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query('conversations')
      .withIndex('by_state_needs_human', (i) => i.eq('state', 'NEEDS_HUMAN'))
      .order('asc')
      .take(Math.min(limit ?? 5, 50));
    return withCampaignNames(ctx, rows);
  },
});
