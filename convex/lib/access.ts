/**
 * Authenticated function builders. EVERY public query/mutation/action in this app must use
 * these instead of the raw `query` / `mutation` / `action` builders.
 *
 * Each call checks: (1) a valid Convex Auth session, (2) the user's email is still on the
 * allowlist. Removing an email from ALLOWED_EMAILS revokes access on the next call.
 */
import { getAuthUserId } from '@convex-dev/auth/server';
import { customAction, customCtx, customMutation, customQuery } from 'convex-helpers/server/customFunctions';
import { makeFunctionReference } from 'convex/server';
import { ConvexError } from 'convex/values';
import { isEmailAllowed } from '../../shared/access';
import type { Doc } from '../_generated/dataModel';
import { action, mutation, query, type QueryCtx } from '../_generated/server';
import { allowList } from './config';

export const NOT_SIGNED_IN = 'NOT_SIGNED_IN';
export const ACCESS_REVOKED = 'ACCESS_REVOKED';

/** Signed-in + allowlisted user, or null. */
export async function currentAllowedUser(ctx: QueryCtx): Promise<Doc<'users'> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  if (!user || !isEmailAllowed(user.email, allowList())) return null;
  return user;
}

async function requireUser(ctx: QueryCtx): Promise<Doc<'users'>> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError(NOT_SIGNED_IN);
  const user = await ctx.db.get(userId);
  if (!user || !isEmailAllowed(user.email, allowList())) throw new ConvexError(ACCESS_REVOKED);
  return user;
}

export const authedQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ user: await requireUser(ctx) })),
);

export const authedMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ user: await requireUser(ctx) })),
);

// Explicitly typed reference to users.allowedViewer. Using `internal.users.allowedViewer` here would
// make TypeScript's inference circular (every action's type would depend on this builder's type).
const allowedViewerRef = makeFunctionReference<'query', Record<string, never>, Doc<'users'> | null>('users:allowedViewer');

/** Actions have no db access; the check runs as an internal query in the caller's auth context. */
export const authedAction = customAction(
  action,
  customCtx(async (ctx) => {
    const user = await ctx.runQuery(allowedViewerRef, {});
    if (!user) throw new ConvexError((await ctx.auth.getUserIdentity()) ? ACCESS_REVOKED : NOT_SIGNED_IN);
    return { user };
  }),
);
