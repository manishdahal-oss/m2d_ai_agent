import { getAuthUserId } from '@convex-dev/auth/server';
import { internalQuery, query } from './_generated/server';
import { currentAllowedUser } from './lib/access';

/**
 * Who is signed in, for the dashboard shell. Returns only the caller's own email.
 * `allowed: false` = signed in, but the email was removed from the allowlist.
 */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const allowed = (await currentAllowedUser(ctx)) !== null;
    return { email: user.email ?? null, allowed };
  },
});

/** Used by authedAction (actions can't read the database directly). */
export const allowedViewer = internalQuery({
  args: {},
  handler: (ctx) => currentAllowedUser(ctx),
});
