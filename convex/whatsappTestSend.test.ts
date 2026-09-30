// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.*s');

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv('ALLOWED_EMAILS', 'owner@example.com');
  vi.stubEnv('TIMES_API_URL', 'https://times.example/wa/v2');
  vi.stubEnv('TIMES_API_KEY', 'KEY123');
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: true, message_id: 'wamid.T1' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function signedIn() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert('users', { email: 'owner@example.com' }));
  return { t, as: t.withIdentity({ subject: `${userId}|s` }) };
}

const args = { to: '98765 43210', templateName: 'm2d_intro', languageCode: 'hi', bodyParams: [] as string[] };

describe('whatsapp.testSend', () => {
  it('requires sign-in', async () => {
    const t = convexTest(schema, modules);
    await expect(t.action(api.whatsapp.testSend.send, args)).rejects.toThrow(/NOT_SIGNED_IN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends via Times, normalises the number and records an audit row', async () => {
    const { t, as } = await signedIn();
    expect(await as.action(api.whatsapp.testSend.send, args)).toEqual({ ok: true, providerMessageId: 'wamid.T1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).to).toBe('919876543210');
    const rows = await t.run((ctx) => ctx.db.query('testSends').collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ to: '+919876543210', status: 'SENT', providerMessageId: 'wamid.T1', provider: 'times' });
    expect(await as.query(api.whatsapp.testSend.recent, {})).toHaveLength(1);
  });

  it('records provider failures', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ status: false, message: 'Template not found' }), { status: 400 }));
    const { t, as } = await signedIn();
    expect(await as.action(api.whatsapp.testSend.send, args)).toMatchObject({ ok: false, error: 'Template not found', httpStatus: 400 });
    expect((await t.run((ctx) => ctx.db.query('testSends').collect()))[0]).toMatchObject({ status: 'FAILED', error: 'Template not found' });
  });

  it('refuses opted-out numbers without calling the provider', async () => {
    const { as, t } = await signedIn();
    await t.mutation(internal.demo.load, {}); // Kavita Joshi (+919990000106) is opted out
    await expect(as.action(api.whatsapp.testSend.send, { ...args, to: '+919990000106' })).rejects.toThrow(/opted out/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid numbers and template names', async () => {
    const { as } = await signedIn();
    await expect(as.action(api.whatsapp.testSend.send, { ...args, to: '12345' })).rejects.toThrow(/Invalid number/);
    await expect(as.action(api.whatsapp.testSend.send, { ...args, templateName: 'Bad Name!' })).rejects.toThrow(/Template name/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rate-limits to 5 test sends per 10 minutes', async () => {
    const { as } = await signedIn();
    for (let i = 0; i < 5; i++) await as.action(api.whatsapp.testSend.send, args);
    await expect(as.action(api.whatsapp.testSend.send, args)).rejects.toThrow(/Limit reached/);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('fails clearly when Times is not configured', async () => {
    vi.stubEnv('TIMES_API_KEY', '');
    const { as } = await signedIn();
    await expect(as.action(api.whatsapp.testSend.send, args)).rejects.toThrow(/not configured.*TIMES_API_KEY/);
  });
});
