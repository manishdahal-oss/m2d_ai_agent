// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.*s');
let timesOk: boolean;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('ALLOWED_EMAILS', 'owner@example.com');
  vi.stubEnv('TIMES_API_URL', 'https://times.example/wa/v2');
  vi.stubEnv('TIMES_API_KEY', 'KEY');
  timesOk = true;
  let n = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      timesOk
        ? new Response(JSON.stringify({ status: true, message_id: `wamid.${++n}` }), { status: 200 })
        : new Response(JSON.stringify({ status: false, message: 'Message not sent' }), { status: 400 }),
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const campaign = { name: 'Wrong upload', templateName: 'm2d_intro', templateLanguage: 'hi', templateText: 'Hi', templateParams: [] as string[], sendRatePerMinute: 60 };

async function setup(phones: string[]) {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert('users', { email: 'owner@example.com' }));
  const as = t.withIdentity({ subject: `${userId}|s` });
  const batchId = await as.mutation(api.customers.startImport, { filename: 'wrong.csv', columns: [] });
  await as.mutation(api.customers.importChunk, {
    batchId,
    mappedFields: ['phone', 'name'],
    rows: phones.map((phone, i) => ({ row: i + 1, fields: { phone, name: `C${i}` }, attributes: {} })),
  });
  return { t, as };
}
const settle = (t: Awaited<ReturnType<typeof setup>>['t']) => t.finishAllScheduledFunctions(vi.runAllTimers);
const counts = (t: Awaited<ReturnType<typeof setup>>['t']) =>
  t.run(async (ctx) => ({
    customers: (await ctx.db.query('customers').collect()).length,
    campaigns: (await ctx.db.query('campaigns').collect()).length,
    conversations: (await ctx.db.query('conversations').collect()).length,
    messages: (await ctx.db.query('messages').collect()).length,
    enrollments: (await ctx.db.query('campaignCustomers').collect()).length,
  }));

describe('deleting a wrong upload', () => {
  it('campaign where every send failed → delete campaign AND its contacts', async () => {
    timesOk = false; // like "Message not sent" for wrong numbers
    const { t, as } = await setup(['9876500001', '9876500002', '9876500003']);
    const id = await as.mutation(api.campaignRun.create, campaign);
    await as.mutation(api.campaignRun.start, { campaignId: id, confirm: true });
    await settle(t);
    expect(await as.query(api.cleanup.campaignDeletePreview, { campaignId: id })).toMatchObject({ contacts: 3, messaged: 0, deletableContacts: 3, blocked: null });

    await as.mutation(api.cleanup.deleteCampaign, { campaignId: id, deleteContacts: true, confirm: true });
    await settle(t);
    expect(await counts(t)).toEqual({ customers: 0, campaigns: 0, conversations: 0, messages: 0, enrollments: 0 });
  });

  it('delete campaign but keep contacts → contacts become messageable again', async () => {
    const { t, as } = await setup(['9876500001', '9876500002']);
    const id = await as.mutation(api.campaignRun.create, { ...campaign, sendRatePerMinute: 1 });
    await as.mutation(api.campaignRun.start, { campaignId: id, confirm: true });
    await as.mutation(api.campaignRun.pause, { campaignId: id });
    await settle(t);
    await as.mutation(api.cleanup.deleteCampaign, { campaignId: id, deleteContacts: false, confirm: true });
    await settle(t);
    expect(await counts(t)).toMatchObject({ customers: 2, campaigns: 0, conversations: 0 });
    expect(await as.query(api.campaignRun.audience, {})).toMatchObject({ reachable: 2 });
  });

  it('refuses to delete a campaign whose customers were messaged', async () => {
    const { t, as } = await setup(['9876500001']);
    const id = await as.mutation(api.campaignRun.create, campaign);
    await as.mutation(api.campaignRun.start, { campaignId: id, confirm: true });
    await settle(t);
    expect((await as.query(api.cleanup.campaignDeletePreview, { campaignId: id }))?.blocked).toMatch(/already messaged/);
    await as.mutation(api.cleanup.deleteCampaign, { campaignId: id, deleteContacts: true, confirm: true });
    await settle(t);
    expect(await counts(t)).toMatchObject({ customers: 1, campaigns: 1, conversations: 1 }); // safety net kept everything
  });

  it('deleteCustomers keeps opted-out and already-messaged contacts, deletes the rest', async () => {
    const { t, as } = await setup(['9876500001', '9876500002', '9876500003']);
    const all = await t.run((ctx) => ctx.db.query('customers').collect());
    await t.run((ctx) => ctx.db.patch(all[0]._id, { eligibility: 'OPTED_OUT', optedOutAt: Date.now() }));
    const id = await as.mutation(api.campaignRun.create, campaign);
    await as.mutation(api.campaignRun.start, { campaignId: id, confirm: true });
    await settle(t); // messages customers 2 and 3
    await t.run((ctx) => ctx.db.insert('customers', { phone: '+919876500009', attributes: {}, eligibility: 'ELIGIBLE', lastActivityAt: 1, searchText: 'x', isDemo: false }));
    const fresh = (await t.run((ctx) => ctx.db.query('customers').withIndex('by_phone', (i) => i.eq('phone', '+919876500009')).unique()))!;

    const r = await as.mutation(api.cleanup.deleteCustomers, { ids: [all[0]._id, all[1]._id, fresh._id] });
    expect(r.deleted).toBe(1);
    expect(r.kept.map((k) => k.reason)).toEqual([expect.stringMatching(/opted out/), expect.stringMatching(/already messaged/)]);
  });

  it('a contact who is also in another campaign is not deleted with the first campaign', async () => {
    timesOk = false;
    const { t, as } = await setup(['9876500001']);
    const a = await as.mutation(api.campaignRun.create, campaign);
    await as.mutation(api.campaignRun.start, { campaignId: a, confirm: true });
    await settle(t);
    // Put the same customer into a second (system) conversation, e.g. a test chat.
    await t.run(async (ctx) => {
      const c = (await ctx.db.query('customers').first())!;
      const other = await ctx.db.insert('campaigns', { name: 'Other', segment: {}, templateLanguage: 'en', status: 'READY', sendRatePerMinute: 1, isDemo: false });
      await ctx.db.insert('conversations', { campaignId: other, customerId: c._id, state: 'NEW', aiPaused: false, lastMessageAt: 1, customerPhone: c.phone, outboundSent: 0, outboundDelivered: 0, inboundCount: 0, searchText: 'x', isDemo: false });
    });
    await as.mutation(api.cleanup.deleteCampaign, { campaignId: a, deleteContacts: true, confirm: true });
    await settle(t);
    expect(await counts(t)).toMatchObject({ customers: 1, campaigns: 1, conversations: 1 });
  });
});
