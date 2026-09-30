/**
 * Internal maintenance (CLI / Convex dashboard only — not callable from the browser).
 *
 *   npx convex run maintenance:deleteTestCustomers '{"externalIdPrefix":"TEST-"}'
 *
 * Hard-guarded to customer ids starting with "TEST-" so it can never touch real data.
 */
import { ConvexError, v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { desktopAnswer } from '../shared/sop';

/**
 * Remove an automated-test dashboard account and every auth record it created.
 * Hard-guarded to m2d-e2e*@example.com addresses (example.com is reserved; never a real user).
 */
export const deleteTestUser = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (!/^m2d-e2e[\w.+-]*@example\.com$/i.test(email)) throw new ConvexError('Only m2d-e2e…@example.com test accounts can be deleted with this tool');
    const users = await ctx.db.query('users').withIndex('email', (i) => i.eq('email', email.toLowerCase())).collect();
    let removed = 0;
    for (const user of users) {
      for (const s of await ctx.db.query('authSessions').withIndex('userId', (i) => i.eq('userId', user._id)).collect()) {
        for (const t of await ctx.db.query('authRefreshTokens').withIndex('sessionId', (i) => i.eq('sessionId', s._id)).collect()) await ctx.db.delete(t._id);
        await ctx.db.delete(s._id);
      }
      for (const a of await ctx.db.query('authAccounts').withIndex('userIdAndProvider', (i) => i.eq('userId', user._id)).collect()) {
        for (const c of await ctx.db.query('authVerificationCodes').withIndex('accountId', (i) => i.eq('accountId', a._id)).collect()) await ctx.db.delete(c._id);
        for (const r of await ctx.db.query('authRateLimits').withIndex('identifier', (i) => i.eq('identifier', a.providerAccountId)).collect()) await ctx.db.delete(r._id);
        await ctx.db.delete(a._id);
      }
      for (const b of await ctx.db.query('importBatches').collect()) if (b.importedBy === user._id) await ctx.db.patch(b._id, { importedBy: undefined });
      await ctx.db.delete(user._id);
      removed++;
    }
    return { removedUsers: removed };
  },
});

export const deleteTestCustomers = internalMutation({
  args: { externalIdPrefix: v.string(), importFilename: v.optional(v.string()) },
  handler: async (ctx, { externalIdPrefix, importFilename }) => {
    if (!/^TEST-/.test(externalIdPrefix)) throw new ConvexError('Only TEST- prefixed customer ids can be deleted with this tool');
    const matches = await ctx.db
      .query('customers')
      .withIndex('by_external_id', (i) => i.gte('externalId', externalIdPrefix).lt('externalId', `${externalIdPrefix}￿`))
      .collect();
    for (const c of matches) {
      const convs = await ctx.db.query('conversations').withIndex('by_customer', (i) => i.eq('customerId', c._id)).first();
      if (convs) throw new ConvexError(`Refusing: ${c.externalId} has conversations`);
      for (const e of await ctx.db.query('campaignCustomers').withIndex('by_customer', (i) => i.eq('customerId', c._id)).collect()) await ctx.db.delete(e._id);
      await ctx.db.delete(c._id);
    }
    let batches = 0;
    if (importFilename) {
      for (const b of await ctx.db.query('importBatches').collect()) {
        if (b.filename === importFilename) {
          await ctx.db.delete(b._id);
          batches++;
        }
      }
    }
    return { deletedCustomers: matches.length, deletedBatches: batches };
  },
});

/** Remove webhook events created by deployment self-checks (payloads tagged m2d_selftest). */
export const deleteWebhookSelfTests = internalMutation({
  args: {},
  handler: async (ctx) => {
    let n = 0;
    for (const e of await ctx.db.query('webhookEvents').collect()) {
      if (JSON.stringify(e.payload).includes('"m2d_selftest":true')) {
        await ctx.db.delete(e._id);
        n++;
      }
    }
    return { deleted: n };
  },
});

/** One-off: set the customer desktop flag (YES/NO) from chats that happened before the flag existed. */
export const backfillDesktopFlag = internalMutation({
  args: {},
  handler: async (ctx) => {
    let yes = 0;
    let no = 0;
    for (const conv of await ctx.db.query('conversations').collect()) {
      const customer = await ctx.db.get(conv.customerId);
      if (!customer) continue;
      const msgs = (await ctx.db.query('messages').withIndex('by_conversation', (i) => i.eq('conversationId', conv._id)).collect()).sort((a, b) => a.at - b.at);
      let lastOut: string | undefined;
      let flag: 'YES' | 'NO' | null = null;
      for (const m of msgs) {
        if (m.direction === 'OUTBOUND') lastOut = m.body;
        else if (!m.metadata?.autoReply) flag = desktopAnswer(m.body, lastOut) ?? flag;
      }
      if (flag && flag !== customer.hasDesktop) {
        await ctx.db.patch(customer._id, { hasDesktop: flag, hasDesktopAt: Date.now() });
        if (flag === 'YES') yes++;
        else no++;
      }
    }
    return { yes, no };
  },
});
