import { v } from 'convex/values';
import { authedQuery as query } from './lib/access';

/** Campaign configuration. Stats come from the analytics action (they need a full scan). */
export const list = query({
  args: {},
  handler: (ctx) => ctx.db.query('campaigns').order('desc').take(200),
});

export const get = query({
  args: { id: v.id('campaigns') },
  handler: (ctx, { id }) => ctx.db.get(id),
});
