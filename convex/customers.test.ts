// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.*s');

beforeEach(() => {
  vi.stubEnv('ALLOWED_EMAILS', 'tester@example.com');
});

/** A test client signed in as an allowlisted dashboard user (Convex Auth subject = "userId|sessionId"). */
async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert('users', { email: 'tester@example.com' }));
  return t.withIdentity({ subject: `${userId}|test-session` });
}
type T = Awaited<ReturnType<typeof setup>>;

const rows = (list: Array<[number, Record<string, string | null>, Record<string, string>?]>) =>
  list.map(([row, fields, attributes]) => ({ row, fields, attributes: attributes ?? {} }));

async function runImport(t: T, mappedFields: string[], data: ReturnType<typeof rows>) {
  const batchId = await t.mutation(api.customers.startImport, { filename: 'test.csv', columns: mappedFields.map((f) => ({ source: f, target: f })) });
  const result = await t.mutation(api.customers.importChunk, { batchId, mappedFields, rows: data });
  return { batchId, ...result };
}

describe('customers.importChunk (server-side re-validation)', () => {
  it('inserts valid rows, rejects bad phones, stores extra columns and eligibility', async () => {
    const t = await setup();
    const r = await runImport(t, ['customer_id', 'name', 'phone', 'language', 'assigned_agent', 'desktop_status'], rows([
      [1, { customer_id: 'C1', name: 'Rahul', phone: '9876543210', language: 'en', assigned_agent: null, desktop_status: null }, { gst_number: '08AAA' }],
      [2, { customer_id: 'C2', name: 'Priya', phone: '+91 98765 43211', language: 'Hindi', assigned_agent: 'Technotask 3', desktop_status: null }],
      [3, { customer_id: 'C3', name: 'Bad', phone: '12345', language: null, assigned_agent: null, desktop_status: null }],
      [4, { customer_id: 'C4', name: 'Desk', phone: '9876543212', language: 'Tamil', assigned_agent: null, desktop_status: 'Installed' }],
    ]));
    expect(r).toMatchObject({ inserted: 3, updated: 0 });
    expect(r.issues).toEqual([{ row: 3, phone: '12345', name: 'Bad', reason: 'Invalid number' }]);

    const all = await t.run((ctx) => ctx.db.query('customers').collect());
    const by = (id: string) => all.find((c) => c.externalId === id)!;
    expect(by('C1')).toMatchObject({ phone: '+919876543210', eligibility: 'ELIGIBLE', attributes: { gst_number: '08AAA' }, isDemo: false });
    expect(by('C2')).toMatchObject({ language: 'hi', eligibility: 'ASSIGNED_TO_HUMAN' });
    expect(by('C4')).toMatchObject({ language: 'ta', eligibility: 'DESKTOP_ALREADY_ACTIVE' });
  });

  it('re-import updates only columns present in the file, and opt-out is sticky', async () => {
    const t = await setup();
    await runImport(t, ['customer_id', 'name', 'phone', 'city'], rows([[1, { customer_id: 'C1', name: 'Rahul', phone: '9876543210', city: 'Jaipur' }]]));
    await t.run(async (ctx) => {
      const c = (await ctx.db.query('customers').collect())[0];
      await ctx.db.patch(c._id, { optedOutAt: Date.now(), eligibility: 'OPTED_OUT' });
    });
    const r = await runImport(t, ['customer_id', 'name', 'phone', 'assigned_agent'], rows([
      [1, { customer_id: 'C1', name: 'Rahul S', phone: '+919876543210', assigned_agent: null }],
      [2, { customer_id: 'C9', name: 'New', phone: '9876543219', assigned_agent: null }],
    ]));
    expect(r).toMatchObject({ inserted: 1, updated: 1 });
    const c1 = await t.run(async (ctx) => (await ctx.db.query('customers').withIndex('by_external_id', (i) => i.eq('externalId', 'C1')).first())!);
    expect(c1).toMatchObject({ name: 'Rahul S', city: 'Jaipur', eligibility: 'OPTED_OUT' });
  });

  it('rejects a customer_id that already belongs to another phone', async () => {
    const t = await setup();
    await runImport(t, ['customer_id', 'phone'], rows([[1, { customer_id: 'C1', phone: '9876543210' }]]));
    const r = await runImport(t, ['customer_id', 'phone'], rows([[1, { customer_id: 'C1', phone: '9876500000' }]]));
    expect(r.inserted + r.updated).toBe(0);
    expect(r.issues[0].reason).toMatch(/already exists with a different phone/);
  });

  it('lookupForImport reports existing customers and whether they were contacted', async () => {
    const t = await setup();
    await t.mutation(internal.demo.load, {});
    const found = await t.query(api.customers.lookupForImport, { phones: ['+919990000101', '+919990000114', '+910000000000'], externalIds: [] });
    expect(found).toHaveLength(2);
    expect(found.find((f) => f.phone === '+919990000101')?.contacted).toBe(true); // Rahul — has a conversation
    expect(found.find((f) => f.phone === '+919990000114')?.contacted).toBe(false); // Deepak — never messaged
  });
});

describe('demo data + analytics', () => {
  it('loads demo data and computes a consistent funnel', async () => {
    const t = await setup();
    await t.mutation(internal.demo.load, {});
    const a = await t.action(api.analytics.compute, {});
    const counts = a.funnel.map((s) => s.count);
    expect(counts).toEqual([17, 12, 10, 6, 5, 3, 1]);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    expect(a.metrics).toMatchObject({ customersUploaded: 20, eligibleCustomers: 16, needsHuman: 2, optedOut: 1 });

    const hi = await t.action(api.analytics.compute, { language: 'hi' });
    expect(hi.funnel[0].count).toBe(6);

    expect(await t.query(api.conversations.needsHumanCount, {})).toEqual({ count: 2, capped: false });
    const queue = await t.query(api.conversations.needsHumanPreview, {});
    expect(queue.map((c) => c.customerName)).toEqual(expect.arrayContaining(['Rahul Sharma', 'Meena Gupta']));
  });

  it('demo:clear removes demo data only', async () => {
    const t = await setup();
    await t.mutation(internal.demo.load, {});
    await runImport(t, ['phone', 'name'], rows([[1, { phone: '9876543210', name: 'Real' }]]));
    await t.mutation(internal.demo.clear, {});
    const left = await t.run(async (ctx) => ({
      customers: await ctx.db.query('customers').collect(),
      conversations: await ctx.db.query('conversations').collect(),
      messages: await ctx.db.query('messages').collect(),
      campaigns: await ctx.db.query('campaigns').collect(),
    }));
    expect(left.customers.map((c) => c.name)).toEqual(['Real']);
    expect(left.conversations).toHaveLength(0);
    expect(left.messages).toHaveLength(0);
    expect(left.campaigns).toHaveLength(0);
  });
});
