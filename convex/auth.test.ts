// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.*s');

beforeEach(() => {
  vi.stubEnv('ALLOWED_EMAILS', 'owner@example.com');
  vi.stubEnv('ALLOWED_EMAIL_DOMAINS', 'vyapar.example');
});

async function withUser(email: string) {
  const t = convexTest(schema, modules);
  await t.mutation(internal.demo.load, {});
  const userId = await t.run((ctx) => ctx.db.insert('users', { email }));
  return { t, as: t.withIdentity({ subject: `${userId}|test-session` }) };
}

/**
 * Every public function the dashboard can reach. If you add a public function,
 * add it here — the guard test below also fails on raw query/mutation/action use.
 */
type Client = Pick<ReturnType<typeof convexTest>, 'query' | 'mutation' | 'action'>;

const calls = (as: Client, fakeBatch: never) =>
  ({
    'customers.list': () => as.query(api.customers.list, { paginationOpts: { numItems: 5, cursor: null } }),
    'customers.lookupForImport': () => as.query(api.customers.lookupForImport, { phones: ['+919990000101'], externalIds: [] }),
    'customers.listImports': () => as.query(api.customers.listImports, {}),
    'customers.startImport': () => as.mutation(api.customers.startImport, { filename: 'x.csv', columns: [] }),
    'customers.importChunk': () => as.mutation(api.customers.importChunk, { batchId: fakeBatch, mappedFields: ['phone'], rows: [] }),
    'customers.finishImport': () =>
      as.mutation(api.customers.finishImport, {
        batchId: fakeBatch,
        issues: [],
        stats: { totalRows: 0, validNumbers: 0, invalidNumbers: 0, duplicatesInFile: 0, alreadyAssigned: 0, alreadyOnDesktop: 0, optedOut: 0, alreadyContacted: 0, eligible: 0, newCustomers: 0, existingCustomers: 0 },
      }),
    'conversations.list': () => as.query(api.conversations.list, { paginationOpts: { numItems: 5, cursor: null } }),
    'conversations.needsHumanCount': () => as.query(api.conversations.needsHumanCount, {}),
    'conversations.needsHumanPreview': () => as.query(api.conversations.needsHumanPreview, {}),
    'campaigns.list': () => as.query(api.campaigns.list, {}),
    'settings.get': () => as.query(api.settings.get, {}),
    'analytics.compute': () => as.action(api.analytics.compute, {}),
    'whatsapp.testSend.send': () => as.action(api.whatsapp.testSend.send, { to: '+919876543210', templateName: 't', languageCode: 'en', bodyParams: [] }),
    'whatsapp.testSend.recent': () => as.query(api.whatsapp.testSend.recent, {}),
    'whatsapp.testSend.recentWebhooks': () => as.query(api.whatsapp.testSend.recentWebhooks, {}),
    'engine.previewReply': () => as.action(api.engine.previewReply, { text: 'hi' }),
    'campaignRun.audience': () => as.query(api.campaignRun.audience, {}),
    'cleanup.deleteCustomers': () => as.mutation(api.cleanup.deleteCustomers, { ids: [] }),
    'campaignRun.create': () => as.mutation(api.campaignRun.create, { name: 'x', templateName: 't', templateLanguage: 'en', templateText: 'hi', templateParams: [], sendRatePerMinute: 10 }),
  }) as Record<string, () => Promise<unknown>>;

async function fakeBatchId(t: ReturnType<typeof convexTest>) {
  return (await t.run((ctx) =>
    ctx.db.insert('importBatches', { filename: 'x', columns: [], issues: [], status: 'IN_PROGRESS', inserted: 0, updated: 0, skipped: 0 }),
  )) as never;
}

describe('access control', () => {
  it('rejects every public function when not signed in', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.demo.load, {});
    for (const [name, call] of Object.entries(calls(t, await fakeBatchId(t)))) {
      await expect(call(), name).rejects.toThrow(/NOT_SIGNED_IN/);
    }
  });

  it('rejects a signed-in user whose email is not (or no longer) on the allowlist', async () => {
    const { t, as } = await withUser('intruder@gmail.com');
    for (const [name, call] of Object.entries(calls(as, await fakeBatchId(t)))) {
      await expect(call(), name).rejects.toThrow(/ACCESS_REVOKED/);
    }
  });

  it('allows allowlisted emails and domains, case-insensitively', async () => {
    for (const email of ['owner@example.com', 'OWNER@Example.com', 'agent@vyapar.example']) {
      const { as } = await withUser(email);
      const page = await as.query(api.customers.list, { paginationOpts: { numItems: 5, cursor: null } });
      expect(page.page.length, email).toBe(5);
    }
  });

  it('revokes access immediately when an email is removed from the allowlist', async () => {
    const { as } = await withUser('owner@example.com');
    await expect(as.query(api.campaigns.list, {})).resolves.toHaveLength(1);
    vi.stubEnv('ALLOWED_EMAILS', '');
    await expect(as.query(api.campaigns.list, {})).rejects.toThrow(/ACCESS_REVOKED/);
  });

  it('users.viewer reports signed-in state without leaking data', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.users.viewer, {})).toBeNull();
    const { as } = await withUser('intruder@gmail.com');
    expect(await as.query(api.users.viewer, {})).toEqual({ email: 'intruder@gmail.com', allowed: false });
    const { as: owner } = await withUser('owner@example.com');
    expect(await owner.query(api.users.viewer, {})).toEqual({ email: 'owner@example.com', allowed: true });
  });

  it('records who ran an import', async () => {
    const { t, as } = await withUser('owner@example.com');
    const batchId = await as.mutation(api.customers.startImport, { filename: 'a.csv', columns: [] });
    const batch = await t.run((ctx) => ctx.db.get(batchId));
    const user = await t.run(async (ctx) => (await ctx.db.query('users').collect()).find((u) => u.email === 'owner@example.com'));
    expect(batch?.importedBy).toBe(user?._id);
  });
});
