// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { DEFAULT_TEMPLATE } from '../shared/templates';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.*s');

let sent: Array<{ to: string; type: string; template?: { name: string; language: { code: string }; components?: unknown[] }; text?: string }>;
let timesStatus: number;
let n = 0;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('ALLOWED_EMAILS', 'owner@example.com');
  vi.stubEnv('TIMES_API_URL', 'https://times.example/wa/v2');
  vi.stubEnv('TIMES_API_KEY', 'KEY');
  vi.stubEnv('DESKTOP_DOWNLOAD_URL', 'https://vyaparapp.in');
  vi.stubEnv('NVIDIA_API_KEY', '');
  vi.stubEnv('AUTO_REPLY_MODE', 'contacted');
  vi.stubEnv('REPLY_DEBOUNCE_MS', '1000');
  sent = [];
  timesStatus = 200;
  n = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (timesStatus !== 200) return new Response(JSON.stringify({ status: false, message: 'Invalid Api Key' }), { status: timesStatus });
      sent.push({ to: body.to, type: body.type, template: body.template, text: body.text?.body });
      return new Response(JSON.stringify({ status: true, message_id: `wamid.${++n}` }), { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert('users', { email: 'owner@example.com' }));
  const as = t.withIdentity({ subject: `${userId}|s` });
  // Upload contacts through the real import path.
  const batchId = await as.mutation(api.customers.startImport, { filename: 'contacts.csv', columns: [] });
  await as.mutation(api.customers.importChunk, {
    batchId,
    mappedFields: ['customer_id', 'name', 'phone', 'assigned_agent'],
    rows: [
      { row: 1, fields: { customer_id: 'V1', name: 'Rahul', phone: '9876500001', assigned_agent: null }, attributes: {} },
      { row: 2, fields: { customer_id: 'V2', name: 'Priya', phone: '9876500002', assigned_agent: null }, attributes: {} },
      { row: 3, fields: { customer_id: 'V3', name: 'Amit', phone: '9876500003', assigned_agent: null }, attributes: {} },
      { row: 4, fields: { customer_id: 'V4', name: 'Tech', phone: '9876500004', assigned_agent: 'Technotask 2' }, attributes: {} },
    ],
  });
  return { t, as };
}

const campaignArgs = {
  name: 'Oct M2D',
  templateName: 'm2d_divya_intro',
  templateLanguage: 'hi',
  templateText: 'Hi {{name}}\n\nMai Divya Vyapar Se, Appne vyapar ka mobile app download kia tha na - aapke sath baat karni thi',
  templateParams: [] as string[],
  sendRatePerMinute: 60,
};
const settle = (t: Awaited<ReturnType<typeof setup>>['t']) => t.finishAllScheduledFunctions(vi.runAllTimers);

describe('campaign sending', () => {
  it('uploaded contacts → template to every eligible, never-messaged contact → campaign completes', async () => {
    const { t, as } = await setup();
    expect(await as.query(api.campaignRun.audience, {})).toMatchObject({ reachable: 3, eligible: 3 });
    const id = await as.mutation(api.campaignRun.create, campaignArgs);
    await as.mutation(api.campaignRun.start, { campaignId: id, confirm: true });
    await settle(t);

    expect(sent.map((s) => s.to).sort()).toEqual(['919876500001', '919876500002', '919876500003']); // Technotask excluded
    expect(sent[0]).toMatchObject({ type: 'template', template: { name: 'm2d_divya_intro', language: { code: 'hi' } } });
    const c = await t.run((ctx) => ctx.db.get(id));
    expect(c).toMatchObject({ status: 'COMPLETED', enrolled: 3, sent: 3, failed: 0, enrollmentDone: true });
    const convs = await t.run((ctx) => ctx.db.query('conversations').collect());
    expect(convs.map((x) => x.state)).toEqual(['MESSAGE_SENT', 'MESSAGE_SENT', 'MESSAGE_SENT']);
    const tmpl = await t.run((ctx) => ctx.db.query('messages').collect());
    expect(tmpl.find((m) => m.body.startsWith('Hi Rahul'))).toBeDefined(); // {{name}} rendered for the AI's context
    expect(await as.query(api.campaignRun.audience, {})).toMatchObject({ reachable: 0 }); // nobody is messaged twice
  });

  it('support_m2d: blank {{1}} keeps its position, {{2}} = INSTALL; the chat shows the filled text', async () => {
    const { t, as } = await setup();
    const id = await as.mutation(api.campaignRun.create, {
      ...campaignArgs,
      templateName: DEFAULT_TEMPLATE.name,
      templateLanguage: DEFAULT_TEMPLATE.language,
      templateText: DEFAULT_TEMPLATE.text,
      templateParams: DEFAULT_TEMPLATE.params,
    });
    await as.mutation(api.campaignRun.start, { campaignId: id, confirm: true });
    await settle(t);
    expect(sent[0]).toMatchObject({
      template: { name: 'support_m2d', components: [{ type: 'body', parameters: [{ type: 'text', text: '\u200B' }, { type: 'text', text: 'INSTALL' }] }] },
    });
    const msgs = await t.run((ctx) => ctx.db.query('messages').collect());
    expect(msgs[0].body).toBe('Hi,\n\nMera name Nisha hai, Aapne Vyapar mobile app par INSTALL kiya hai.\n\nAgar is process mein aapko koi problem aa rahi hai,');
  });

  it('a recipient replies → AI answers (contacted mode); a random number does not get a reply', async () => {
    const { t, as } = await setup();
    const id = await as.mutation(api.campaignRun.create, campaignArgs);
    await as.mutation(api.campaignRun.start, { campaignId: id, confirm: true });
    await settle(t);
    sent.length = 0;
    const inbound = (from: string, id: string, text: string) => ({ entry: [{ changes: [{ value: { messages: [{ from, id, type: 'text', text: { body: text } }] } }] }] });
    await t.fetch('/webhooks/whatsapp', { method: 'POST', body: JSON.stringify(inbound('919876500001', 'in1', 'haan batao')) });
    await t.fetch('/webhooks/whatsapp', { method: 'POST', body: JSON.stringify(inbound('919111111111', 'in2', 'hello')) });
    await settle(t);
    expect(sent).toEqual([expect.objectContaining({ to: '919876500001', type: 'text' })]);
  });

  it('a second campaign skips people already messaged; start twice is refused', async () => {
    const { t, as } = await setup();
    const a = await as.mutation(api.campaignRun.create, campaignArgs);
    await as.mutation(api.campaignRun.start, { campaignId: a, confirm: true });
    await expect(as.mutation(api.campaignRun.start, { campaignId: a, confirm: true })).rejects.toThrow(/running/);
    await settle(t);
    const b = await as.mutation(api.campaignRun.create, { ...campaignArgs, name: 'Second' });
    await as.mutation(api.campaignRun.start, { campaignId: b, confirm: true });
    await settle(t);
    expect(sent).toHaveLength(3);
    expect(await t.run((ctx) => ctx.db.get(b))).toMatchObject({ status: 'COMPLETED', enrolled: 0, sent: 0 });
  });

  it('auto-pauses on a systemic error (bad key) instead of failing the whole list', async () => {
    timesStatus = 401;
    const { t, as } = await setup();
    const id = await as.mutation(api.campaignRun.create, campaignArgs);
    await as.mutation(api.campaignRun.start, { campaignId: id, confirm: true });
    await settle(t);
    const c = await t.run((ctx) => ctx.db.get(id));
    expect(c).toMatchObject({ status: 'PAUSED', failed: 1 });
    expect(c?.lastError).toMatch(/Auto-paused: Invalid Api Key/);
  });

  it('skips a contact who opted out after enrollment', async () => {
    const { t, as } = await setup();
    const id = await as.mutation(api.campaignRun.create, { ...campaignArgs, sendRatePerMinute: 1 });
    await as.mutation(api.campaignRun.start, { campaignId: id, confirm: true });
    await t.run(async (ctx) => {
      const p = (await ctx.db.query('customers').withIndex('by_external_id', (i) => i.eq('externalId', 'V2')).first())!;
      await ctx.db.patch(p._id, { eligibility: 'OPTED_OUT', optedOutAt: Date.now() });
    });
    await settle(t);
    expect(sent.map((s) => s.to)).not.toContain('919876500002');
    expect(sent).toHaveLength(2);
  });

  it('pause stops sending; resume continues', async () => {
    const { t, as } = await setup();
    const id = await as.mutation(api.campaignRun.create, { ...campaignArgs, sendRatePerMinute: 1 });
    await as.mutation(api.campaignRun.start, { campaignId: id, confirm: true });
    await as.mutation(api.campaignRun.pause, { campaignId: id });
    await settle(t);
    expect(sent).toHaveLength(0);
    await as.mutation(api.campaignRun.start, { campaignId: id, confirm: true });
    await settle(t);
    expect(sent).toHaveLength(3);
  });

  it('validates the campaign form', async () => {
    const { as } = await setup();
    await expect(as.mutation(api.campaignRun.create, { ...campaignArgs, templateName: 'Bad Name' })).rejects.toThrow(/Template name/);
    await expect(as.mutation(api.campaignRun.create, { ...campaignArgs, sendRatePerMinute: 500 })).rejects.toThrow(/between 1 and 60/);
  });
});
