import { describe, expect, it, vi } from 'vitest';
import { toProviderNumber } from './provider';
import { TimesProvider } from './times';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function provider(responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  const sleep = vi.fn(async () => {});
  return { p: new TimesProvider({ apiUrl: 'https://times.example/wa/v2/', apiKey: 'KEY123', fetchImpl, sleep }), calls, sleep };
}

describe('TimesProvider', () => {
  it('sends a Cloud-API–style template with the raw key as Authorization', async () => {
    const { p, calls } = provider([json(200, { status: true, message: 'ok', message_id: 'wamid.123', code: 200 })]);
    const r = await p.sendTemplate({ to: '+919876543210', templateName: 'm2d_intro', languageCode: 'hi', bodyParams: ['Rahul'] });
    expect(r).toMatchObject({ ok: true, providerMessageId: 'wamid.123' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://times.example/wa/v2/messages/send');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('KEY123');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '919876543210',
      type: 'template',
      template: { name: 'm2d_intro', language: { code: 'hi' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Rahul' }] }] },
    });
  });

  it('sends a blank variable as a zero-width space so {{2}} stays {{2}}', async () => {
    const { p, calls } = provider([json(200, { status: true, message_id: 'x' })]);
    await p.sendTemplate({ to: '+919876543210', templateName: 'support_m2d', languageCode: 'en', bodyParams: ['', 'INSTALL'] });
    expect(JSON.parse(String(calls[0].init.body)).template.components[0].parameters).toEqual([
      { type: 'text', text: '\u200B' },
      { type: 'text', text: 'INSTALL' },
    ]);
  });

  it('omits components for a template without variables', async () => {
    const { p, calls } = provider([json(200, { status: true, message_id: 'x' })]);
    await p.sendTemplate({ to: '+919876543210', templateName: 'm2d_intro', languageCode: 'en' });
    expect(JSON.parse(String(calls[0].init.body)).template).toEqual({ name: 'm2d_intro', language: { code: 'en' } });
  });

  it('sends free-form text', async () => {
    const { p, calls } = provider([json(200, { status: true, message_id: 'x' })]);
    await p.sendText({ to: '+919876543210', text: 'Here is the link' });
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ type: 'text', text: { body: 'Here is the link' } });
  });

  it('reports validation errors (400) with details and does not retry', async () => {
    const { p, calls } = provider([
      json(400, { status: false, message: 'Model invalid', message_id: null, code: 400, res_json: [{ to: '"to" is required' }] }),
    ]);
    const r = await p.sendTemplate({ to: '+919876543210', templateName: 't', languageCode: 'en' });
    expect(r).toMatchObject({ ok: false, retryable: false, httpStatus: 400 });
    expect(r.ok === false && r.error).toContain('Model invalid — "to" is required');
    expect(calls).toHaveLength(1);
  });

  it('reports a bad key (401) without retrying', async () => {
    const { p, calls } = provider([json(401, { status: false, message: 'Invalid Api Key', code: 401 })]);
    const r = await p.sendTemplate({ to: '+919876543210', templateName: 't', languageCode: 'en' });
    expect(r).toMatchObject({ ok: false, retryable: false, error: 'Invalid Api Key' });
    expect(calls).toHaveLength(1);
  });

  it('retries only when the provider clearly did not accept the message (429/503)', async () => {
    const { p, calls, sleep } = provider([json(429, { status: false, message: 'slow down' }), json(503, {}), json(200, { status: true, message_id: 'ok-3' })]);
    const r = await p.sendTemplate({ to: '+919876543210', templateName: 't', languageCode: 'en' });
    expect(r).toMatchObject({ ok: true, providerMessageId: 'ok-3' });
    expect(calls).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('never auto-retries a network error or 500 (the message may have been sent)', async () => {
    const a = provider([new TypeError('socket hang up')]);
    expect(await a.p.sendTemplate({ to: '+919876543210', templateName: 't', languageCode: 'en' })).toMatchObject({ ok: false, retryable: true, httpStatus: null });
    expect(a.calls).toHaveLength(1);
    const b = provider([json(500, { status: false, message: 'oops' })]);
    expect(await b.p.sendTemplate({ to: '+919876543210', templateName: 't', languageCode: 'en' })).toMatchObject({ ok: false, retryable: true, httpStatus: 500 });
    expect(b.calls).toHaveLength(1);
  });

  it('treats HTTP 200 with status:false as a failure', async () => {
    const { p } = provider([json(200, { status: false, message: 'Template not approved' })]);
    expect(await p.sendTemplate({ to: '+919876543210', templateName: 't', languageCode: 'en' })).toMatchObject({ ok: false, error: 'Template not approved' });
  });

  it('toProviderNumber strips + and rejects nonsense', () => {
    expect(toProviderNumber('+919876543210')).toBe('919876543210');
    expect(() => toProviderNumber('+12')).toThrow();
  });
});
