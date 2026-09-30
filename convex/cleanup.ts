/**
 * Deleting wrong uploads / campaigns.
 *
 * Guard rails (never lose real history, never break an opt-out):
 *  - A campaign can be deleted only if none of its templates was successfully sent.
 *  - A contact can be deleted only if we never successfully messaged them and they never wrote
 *    to us, and they have NOT opted out (keeping opt-outs prevents re-messaging after a re-upload).
 * Work is done in batches (scheduled), so large campaigns/uploads are fine.
 */
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx, type QueryCtx } from './_generated/server';
import { authedMutation, authedQuery } from './lib/access';

const BATCH = 100;
const DELIVERED = new Set(['SENT', 'DELIVERED', 'READ']);

/** Why a customer must be kept, or null if safe to delete. */
async function keepReason(ctx: QueryCtx, customer: Doc<'customers'>): Promise<string | null> {
  if (customer.eligibility === 'OPTED_OUT') return 'opted out (kept so they are never messaged again)';
  const msgs = await ctx.db.query('messages').withIndex('by_customer_direction', (i) => i.eq('customerId', customer._id)).collect();
  if (msgs.some((m) => m.direction === 'INBOUND')) return 'has replied on WhatsApp';
  if (msgs.some((m) => m.direction === 'OUTBOUND' && DELIVERED.has(m.status))) return 'was already messaged';
  return null;
}

async function deleteConversation(ctx: MutationCtx, conv: Doc<'conversations'>) {
  for (const table of ['messages', 'conversationEvents', 'aiRuns'] as const) {
    for (const r of await ctx.db.query(table).withIndex('by_conversation', (i) => i.eq('conversationId', conv._id)).collect()) await ctx.db.delete(r._id);
  }
  if (conv.campaignCustomerId) {
    const cc = await ctx.db.get(conv.campaignCustomerId);
    if (cc) await ctx.db.delete(cc._id);
  }
  await ctx.db.delete(conv._id);
  // Keep campaign counters honest.
  const campaign = await ctx.db.get(conv.campaignId);
  if (campaign && !campaign.isSystem) {
    await ctx.db.patch(campaign._id, {
      enrolled: Math.max(0, (campaign.enrolled ?? 0) - 1),
      ...(conv.state === 'FAILED' ? { failed: Math.max(0, (campaign.failed ?? 0) - 1) } : {}),
    });
  }
}

/** Point the customer at their remaining latest conversation (or none) after a deletion. */
async function refreshLatest(ctx: MutationCtx, customerId: Id<'customers'>) {
  const convs = await ctx.db.query('conversations').withIndex('by_customer', (i) => i.eq('customerId', customerId)).collect();
  const latest = convs.sort((a, b) => b.lastMessageAt - a.lastMessageAt)[0];
  await ctx.db.patch(customerId, { latestConversationId: latest?._id, latestState: latest?.state });
}

async function deleteCustomer(ctx: MutationCtx, customer: Doc<'customers'>) {
  for (const conv of await ctx.db.query('conversations').withIndex('by_customer', (i) => i.eq('customerId', customer._id)).collect()) await deleteConversation(ctx, conv);
  for (const cc of await ctx.db.query('campaignCustomers').withIndex('by_customer', (i) => i.eq('customerId', customer._id)).collect()) await ctx.db.delete(cc._id);
  await ctx.db.delete(customer._id);
}

/* ───────────────────────── Contacts ───────────────────────── */

export const deleteCustomers = authedMutation({
  args: { ids: v.array(v.id('customers')) },
  handler: async (ctx, { ids }) => {
    if (ids.length > 200) throw new ConvexError('Delete at most 200 contacts at a time.');
    let deleted = 0;
    const kept: Array<{ name: string; reason: string }> = [];
    for (const id of ids) {
      const c = await ctx.db.get(id);
      if (!c) continue;
      const reason = await keepReason(ctx, c);
      if (reason) {
        kept.push({ name: c.name ?? c.phone, reason });
        continue;
      }
      await deleteCustomer(ctx, c);
      deleted++;
    }
    console.info(`[cleanup] ${ctx.user.email} deleted ${deleted} contacts (${kept.length} kept)`);
    return { deleted, kept };
  },
});

/* ───────────────────────── Campaigns ───────────────────────── */

/** What deleting this campaign would do (shown before confirming). */
export const campaignDeletePreview = authedQuery({
  args: { campaignId: v.id('campaigns') },
  handler: async (ctx, { campaignId }) => {
    const c = await ctx.db.get(campaignId);
    if (!c) return null;
    // One indexed read; "messaged" comes from counters kept on each conversation, so this stays
    // within Convex's per-request read limit even for campaigns with thousands of contacts.
    const convs = await ctx.db.query('conversations').withIndex('by_campaign_last_message', (i) => i.eq('campaignId', campaignId)).collect();
    const messaged = convs.filter((x) => x.contactedAt !== undefined || x.outboundSent > 0 || x.inboundCount > 0).length;
    // Exact count of deletable contacts needs ~3 reads per contact: only for small campaigns.
    let deletableContacts: number | null = null;
    if (messaged === 0 && convs.length <= PREVIEW_EXACT_LIMIT) {
      deletableContacts = 0;
      for (const conv of convs) {
        const customer = await ctx.db.get(conv.customerId);
        if (customer && !(await keepReason(ctx, customer))) {
          const others = await ctx.db.query('conversations').withIndex('by_customer', (i) => i.eq('customerId', customer._id)).collect();
          if (others.every((o) => o.campaignId === campaignId)) deletableContacts++;
        }
      }
    }
    const blocked = c.status === 'RUNNING' ? 'Pause the campaign first.' : messaged > 0 ? `${messaged} customers in this campaign were already messaged — their history must be kept.` : null;
    return { contacts: convs.length, messaged, deletableContacts, blocked };
  },
});

const PREVIEW_EXACT_LIMIT = 800;

export const deleteCampaign = authedMutation({
  args: { campaignId: v.id('campaigns'), deleteContacts: v.boolean(), confirm: v.literal(true) },
  handler: async (ctx, { campaignId, deleteContacts }) => {
    const c = await ctx.db.get(campaignId);
    if (!c || c.isSystem) throw new ConvexError('Campaign not found.');
    if (c.status === 'RUNNING') throw new ConvexError('Pause the campaign first.');
    // Stop any send loop and hide it from the dashboard while batches run.
    await ctx.db.patch(campaignId, { status: 'PAUSED', loopToken: undefined, name: c.name.startsWith('[Deleting] ') ? c.name : `[Deleting] ${c.name}` });
    await ctx.scheduler.runAfter(0, internal.cleanup.deleteCampaignBatch, { campaignId, deleteContacts, by: ctx.user.email ?? 'unknown' });
  },
});

export const deleteCampaignBatch = internalMutation({
  args: { campaignId: v.id('campaigns'), deleteContacts: v.boolean(), by: v.string() },
  handler: async (ctx, { campaignId, deleteContacts, by }) => {
    const c = await ctx.db.get(campaignId);
    if (!c) return;
    const convs = await ctx.db.query('conversations').withIndex('by_campaign_last_message', (i) => i.eq('campaignId', campaignId)).take(BATCH);
    for (const conv of convs) {
      const msgs = await ctx.db.query('messages').withIndex('by_conversation', (i) => i.eq('conversationId', conv._id)).collect();
      if (msgs.some((m) => m.direction === 'INBOUND' || (m.direction === 'OUTBOUND' && DELIVERED.has(m.status)))) {
        // Safety net: someone was messaged after the check — stop and keep everything that's left.
        await ctx.db.patch(campaignId, { name: c.name.replace(/^\[Deleting\] /, ''), lastError: 'Deletion stopped: some customers in this campaign were messaged.' });
        return;
      }
      const customer = await ctx.db.get(conv.customerId);
      await deleteConversation(ctx, conv);
      if (customer) {
        const remaining = await ctx.db.query('conversations').withIndex('by_customer', (i) => i.eq('customerId', customer._id)).first();
        if (deleteContacts && !remaining && !(await keepReason(ctx, customer))) await deleteCustomer(ctx, customer);
        else await refreshLatest(ctx, customer._id);
      }
    }
    if (convs.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.cleanup.deleteCampaignBatch, { campaignId, deleteContacts, by });
      return;
    }
    for (const cc of await ctx.db.query('campaignCustomers').withIndex('by_campaign_customer', (i) => i.eq('campaignId', campaignId)).collect()) await ctx.db.delete(cc._id);
    await ctx.db.delete(campaignId);
    console.info(`[cleanup] campaign "${c.name}" deleted by ${by} (contacts ${deleteContacts ? 'deleted' : 'kept'})`);
  },
});
