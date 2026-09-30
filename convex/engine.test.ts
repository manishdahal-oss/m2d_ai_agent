// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.*s');
const ME = '+919876543210';
const ME_WA = '919876543210';

let sent: Array<{ to: string; type: string; text?: string }>;
let nvidiaCalls: number;
let nvidiaReply: string | null;
let n = 0;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('ALLOWED_EMAILS', 'owner@example.com');
  vi.stubEnv('TIMES_API_URL', 'https://times.example/wa/v2');
  vi.stubEnv('TIMES_API_KEY', 'KEY');
  vi.stubEnv('DESKTOP_DOWNLOAD_URL', 'https://example.com/desktop');
  vi.stubEnv('REPLY_DEBOUNCE_MS', '5000');
  vi.stubEnv('NVIDIA_API_KEY', '');
  vi.stubEnv('AUTO_REPLY_MODE', '');
  vi.stubEnv('MESSAGE_LIMIT', '');
  vi.stubEnv('TIMES_WEBHOOK_SECRET', '');
  sent = [];
  nvidiaCalls = 0;
  nvidiaReply = null;
  n = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      if (String(url).includes('/chat/completions')) {
        nvidiaCalls++;
        return new Response(JSON.stringify({ choices: [{ message: { content: nvidiaReply } }], usage: { prompt_tokens: 100, completion_tokens: 30 } }), { status: 200 });
      }
      const body = JSON.parse(String(init.body));
      sent.push({ to: body.to, type: body.type, text: body.text?.body });
      return new Response(JSON.stringify({ status: true, message_id: `wamid.out${++n}` }), { status: 200 });
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
  return { t, as: t.withIdentity({ subject: `${userId}|s` }) };
}

type T = Awaited<ReturnType<typeof setup>>['t'];

const inbound = (text: string, id: string, from = ME_WA) => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ field: 'messages', value: { contacts: [{ profile: { name: 'Manish' }, wa_id: from }], messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }] } }] }],
});

async function webhook(t: T, payload: unknown, query = '') {
  return t.fetch(`/webhooks/whatsapp${query}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}
const settle = (t: T) => t.finishAllScheduledFunctions(vi.runAllTimers);

async function startTestChat(as: Awaited<ReturnType<typeof setup>>['as']) {
  await as.action(api.whatsapp.testSend.send, {
    to: ME,
    templateName: 'm2d_divya_intro',
    languageCode: 'hi',
    bodyParams: [],
    templateText: 'Hi, Mai Divya Vyapar Se, Appne vyapar ka mobile app download kia tha na - aapke sath baat karni thi',
  });
  sent.length = 0; // ignore the template itself
}

const convOf = (t: T) =>
  t.run(async (ctx) => {
    const c = (await ctx.db.query('customers').withIndex('by_phone', (i) => i.eq('phone', ME)).unique())!;
    const conv = (await ctx.db.query('conversations').withIndex('by_customer', (i) => i.eq('customerId', c._id)).first())!;
    const messages = await ctx.db.query('messages').withIndex('by_conversation', (i) => i.eq('conversationId', conv._id)).collect();
    return { customer: c, conv, messages };
  });

describe('conversation engine', () => {
  it('test send → customer reply via webhook → one free-text reply (knowledge fallback, no LLM key)', async () => {
    const { t, as } = await setup();
    await startTestChat(as);
    const res = await webhook(t, inbound('haan batao', 'wamid.in1'));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(0); // debounced, not immediate
    await settle(t);

    expect(sent).toEqual([expect.objectContaining({ to: ME_WA, type: 'text' })]);
    // SOP step 2: greet once, then ask the business type.
    expect(sent[0].text).toBe('Namaste Sir\n\nAapka kis cheez ka business hai? Bata dijiye, Vyapar ke kuch acche features hain, main aapko batati hoon.');
    const { conv, messages } = await convOf(t);
    expect(messages.map((m) => [m.direction, m.senderType, m.status])).toEqual([
      ['OUTBOUND', 'SYSTEM', 'SENT'], // template
      ['INBOUND', 'CUSTOMER', 'RECEIVED'],
      ['OUTBOUND', 'AI', 'SENT'],
    ]);
    expect(conv.state).toBe('AI_CONVERSATION');
    expect(conv.firstReplyAt).toBeDefined();
    const run = await t.run((ctx) => ctx.db.query('aiRuns').first());
    expect(run).toMatchObject({ status: 'FALLBACK', provider: 'sop' });
  });

  it('uses Nemotron when configured, and records structured metadata', async () => {
    vi.stubEnv('NVIDIA_API_KEY', 'nv-key');
    nvidiaReply = JSON.stringify({ reply: 'Haan ji! Desktop par billing bade screen par hoti hai. Link bheju?', intent: 'Interest', sentiment: 'Positive', stage: 'INTERESTED', next_action: 'Offer link', confidence: 0.9 });
    const { t, as } = await setup();
    await startTestChat(as);
    await webhook(t, inbound('haan batao', 'wamid.in1'));
    await settle(t);
    expect(nvidiaCalls).toBe(1);
    expect(sent[0].text).toBe('Namaste Sir\n\nHaan ji! Desktop par billing bade screen par hoti hai. Link bheju?'); // first reply greets
    expect(await t.run((ctx) => ctx.db.query('aiRuns').first())).toMatchObject({ status: 'SUCCEEDED', intent: 'Interest', confidence: 0.9, inputTokens: 100 });
  });

  it('falls back to approved knowledge if the LLM returns junk', async () => {
    vi.stubEnv('NVIDIA_API_KEY', 'nv-key');
    nvidiaReply = 'I think I should say hi';
    const { t, as } = await setup();
    await startTestChat(as);
    await webhook(t, inbound('haan batao', 'wamid.in1'));
    await settle(t);
    expect(sent[0].text).toMatch(/kis cheez ka business/); // SOP continues without the AI
    expect(await t.run((ctx) => ctx.db.query('aiRuns').first())).toMatchObject({ status: 'FALLBACK', error: 'Model output was not valid JSON' });
  });

  it('ignores duplicate webhook deliveries and replies once to a burst of messages', async () => {
    const { t, as } = await setup();
    await startTestChat(as);
    await webhook(t, inbound('hi', 'wamid.in1'));
    await webhook(t, inbound('hi', 'wamid.in1')); // provider retry
    await webhook(t, inbound('what is this about?', 'wamid.in2'));
    await settle(t);
    expect(sent).toHaveLength(1);
    const { messages } = await convOf(t);
    expect(messages.filter((m) => m.direction === 'INBOUND')).toHaveLength(2);
  });

  it('caps at MESSAGE_LIMIT: the last message is the closing message with link + helpline, then silence', async () => {
    vi.stubEnv('MESSAGE_LIMIT', '4'); // template + 2 replies + closing
    const { t, as } = await setup();
    await startTestChat(as);
    for (const [i, text] of ['haan', 'kirana store hai', 'kuch aur batao', 'hmm', 'ok'].entries()) {
      await webhook(t, inbound(text, `wamid.in${i}`));
      await settle(t);
    }
    expect(sent).toHaveLength(3);
    expect(sent[1].text).toContain('Kirana business ke liye');
    expect(sent[2].text).toContain('+91 9333911911');
    expect(sent[2].text).toContain('example.com/desktop');
    const { conv, messages } = await convOf(t);
    expect(conv.limitReachedAt).toBeDefined();
    expect(messages.filter((m) => m.direction === 'OUTBOUND' && m.status !== 'FAILED')).toHaveLength(4);
    expect(messages.filter((m) => m.direction === 'INBOUND')).toHaveLength(5); // still logged
  });

  it('STOP → confirmation, opted out, never messaged again', async () => {
    const { t, as } = await setup();
    await startTestChat(as);
    await webhook(t, inbound('STOP', 'wamid.in1'));
    await settle(t);
    expect(sent).toHaveLength(1);
    const { customer, conv } = await convOf(t);
    expect(customer.eligibility).toBe('OPTED_OUT');
    expect(conv.state).toBe('STOPPED');
    await webhook(t, inbound('hello?', 'wamid.in2'));
    await settle(t);
    expect(sent).toHaveLength(1);
    await expect(as.action(api.whatsapp.testSend.send, { to: ME, templateName: 'm2d_divya_intro', languageCode: 'hi', bodyParams: [] })).rejects.toThrow(/opted out/);
  });

  it('human request → helpline reply + Needs Human, and the AI stays quiet afterwards', async () => {
    const { t, as } = await setup();
    await startTestChat(as);
    await webhook(t, inbound('can someone call me?', 'wamid.in1'));
    await settle(t);
    expect(sent[0].text).toBe('Of course. You can call +91 9333911911, our team will help you.'); // English question → English SOP line
    const { conv } = await convOf(t);
    expect(conv).toMatchObject({ state: 'NEEDS_HUMAN', needsHumanReason: 'Customer requested assistance.' });
    await webhook(t, inbound('hello?', 'wamid.in2'));
    await settle(t);
    expect(sent).toHaveLength(1);
  });

  it('test_only mode: unknown numbers are recorded but not answered; "all" answers them', async () => {
    const { t } = await setup();
    await webhook(t, inbound('hi', 'wamid.x1', '919111111111'));
    await settle(t);
    expect(sent).toHaveLength(0);
    const skipped = await t.run(async (ctx) => (await ctx.db.query('messages').first())!.metadata);
    expect(skipped.replySkipped).toMatch(/test numbers/);

    vi.stubEnv('AUTO_REPLY_MODE', 'all');
    await webhook(t, inbound('hi again', 'wamid.x2', '919111111111'));
    await settle(t);
    expect(sent).toEqual([expect.objectContaining({ to: '919111111111' })]);
    const cust = await t.run((ctx) => ctx.db.query('customers').withIndex('by_phone', (i) => i.eq('phone', '+919111111111')).unique());
    expect(cust).toMatchObject({ source: 'inbound', name: 'Manish' });
  });

  it('delivery statuses update the message (never downgrading) and delivered counts', async () => {
    const { t, as } = await setup();
    await startTestChat(as);
    await webhook(t, inbound('haan', 'wamid.in1'));
    await settle(t);
    const statuses = (status: string) => ({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.out2', status, recipient_id: ME_WA }] } }] }] });
    await webhook(t, statuses('read'));
    await webhook(t, statuses('delivered')); // late, must not downgrade
    const { conv, messages } = await convOf(t);
    expect(messages.find((m) => m.providerMessageId === 'wamid.out2')?.status).toBe('READ');
    expect(conv.outboundDelivered).toBe(1);
  });

  it('stores unrecognised payloads for mapping, and enforces the webhook secret when set', async () => {
    const { t } = await setup();
    expect((await webhook(t, { some: 'thing' })).status).toBe(200);
    expect(await t.run((ctx) => ctx.db.query('webhookEvents').first())).toMatchObject({ status: 'IGNORED', payload: { some: 'thing' } });
    vi.stubEnv('TIMES_WEBHOOK_SECRET', 's3cret');
    expect((await webhook(t, { some: 'thing' })).status).toBe(401);
    expect((await webhook(t, { some: 'thing' }, '?key=s3cret')).status).toBe(200);
  });

  it('answers Meta-style GET verification', async () => {
    const { t } = await setup();
    const r = await t.fetch('/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=12345&hub.verify_token=x', { method: 'GET' });
    expect(await r.text()).toBe('12345');
  });

  it('never sends the same message twice (screenshot case): 2nd answer is new and carries the link', async () => {
    vi.stubEnv('NVIDIA_API_KEY', 'nv-key');
    // The model keeps returning the identical reply — as seen in production on 2026-09-30.
    nvidiaReply = JSON.stringify({ reply: 'Vyapar Desktop ka free version available hai. Kya aap ise try karna chahenge?', intent: 'asking about fees', sentiment: 'Neutral', stage: 'AI_CONVERSATION', next_action: 'x', confidence: 0.9 });
    const { t, as } = await setup();
    await startTestChat(as);
    await webhook(t, inbound('फीस क्या है', 'wamid.in1'));
    await settle(t);
    await webhook(t, inbound('और मों. पर', 'wamid.in2'));
    await settle(t);
    expect(sent).toHaveLength(2);
    expect(sent[1].text).not.toBe(sent[0].text);
    expect(sent[1].text).toContain('kis cheez ka business'); // the repeat was replaced by the SOP's next step
  });

  it('SOP: business → mapped features + device question → "haan" → exact download/demo/helpline message', async () => {
    vi.stubEnv('HELPLINE_NUMBER', '9333911911');
    vi.stubEnv('DESKTOP_DOWNLOAD_URL', 'https://vyaparapp.in');
    const { t, as } = await setup();
    await startTestChat(as);
    for (const [i, text] of ['haan batao', 'medical store hai', 'haan laptop hai'].entries()) {
      await webhook(t, inbound(text, `wamid.sop${i}`));
      await settle(t);
    }
    expect(sent.map((m) => m.text)).toEqual([
      'Namaste Sir\n\nAapka kis cheez ka business hai? Bata dijiye, Vyapar ke kuch acche features hain, main aapko batati hoon.',
      'Medical shop ke liye Vyapar ke desktop version mein aap batch number, expiry date aur manufacturing date ke hisaab se stock track kar sakte ho. Batch tracking report, barcode scanning aur multiple billing bhi use kar sakte ho. Aapke paas desktop ya laptop hai kya?',
      'Theek hai. Aap Vyapar ka Desktop version vyaparapp.in se download kijiyega. Uske baad hum aapko full demo denge. Agar kuch dikkat ho to 9333911911 par call kijiye.',
    ]);
    const { conv } = await convOf(t);
    expect(conv).toMatchObject({ state: 'DESKTOP_LINK_SENT', businessCategory: 'pharmacy' });
    expect(conv.linkSentAt).toBeDefined();
  });

  it('no desktop/laptop → nothing sent, customer is left for good', async () => {
    const { t, as } = await setup();
    await startTestChat(as);
    for (const [i, text] of ['haan', 'kirana hai', 'nahi', 'hello?'].entries()) {
      await webhook(t, inbound(text, `wamid.no${i}`));
      await settle(t);
    }
    expect(sent).toHaveLength(2); // business question + recommendation; nothing after "nahi"
    const { conv } = await convOf(t);
    expect(conv.state).toBe('NOT_INTERESTED');
    expect(conv.leftAt).toBeDefined();
    expect((await t.run((ctx) => ctx.db.get(conv.customerId)))?.hasDesktop).toBe('NO');
  });

  it('business auto-replies get no answer and do not count; the real reply after it is answered', async () => {
    const { t, as } = await setup();
    await startTestChat(as);
    await webhook(t, inbound('Thank you for contacting HUMEIR CLOTHING! Please let us know how we can help you.', 'wamid.auto1'));
    await webhook(t, inbound("Thank you for your message. We're unavailable right now, but will respond as soon as possible.", 'wamid.auto2'));
    await settle(t);
    expect(sent).toHaveLength(0);
    expect((await convOf(t)).conv.firstReplyAt).toBeUndefined();
    await webhook(t, inbound('haan batao', 'wamid.real'));
    await settle(t);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toMatch(/kis cheez ka business/); // Hinglish — the English auto-replies are ignored
  });

  it('personal messages ("I love you 😘") get no reply', async () => {
    const { t, as } = await setup();
    await startTestChat(as);
    await webhook(t, inbound('I love you 😘', 'wamid.p1'));
    await settle(t);
    expect(sent).toHaveLength(0);
  });

  it('two quick messages → ONE reply that answers both', async () => {
    const { t, as } = await setup();
    await startTestChat(as);
    await webhook(t, inbound('haan batao', 'wamid.q1'));
    await webhook(t, inbound('kirana store hai', 'wamid.q2'));
    await settle(t);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toMatch(/Kirana business/);
  });

  it('no business → nothing sent, customer is left', async () => {
    const { t, as } = await setup();
    await startTestChat(as);
    for (const [i, text] of ['haan', 'nahi hai'].entries()) {
      await webhook(t, inbound(text, `wamid.nb${i}`));
      await settle(t);
    }
    expect(sent).toHaveLength(1); // only the business question
    expect((await convOf(t)).conv.leftAt).toBeDefined();
  });
});
