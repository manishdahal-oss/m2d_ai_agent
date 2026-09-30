import { describe, expect, it } from 'vitest';
import { VYAPAR_DESKTOP_KNOWLEDGE } from '../../shared/knowledge/vyaparDesktop';
import { detectBusiness } from '../../shared/knowledge/businessFeatures';
import { buildSystemPrompt, enforceStyle, parseAgentOutput } from './agent';

const policy = { messageLimit: 10, helpline: '+91 9333911911', desktopDownloadUrl: 'https://example.com/desktop' };

describe('agent output validation', () => {
  it('parses JSON (even inside code fences) and normalises fields', () => {
    const out = parseAgentOutput('```json\n{"reply":"Haan ji!","intent":"Interest","sentiment":"Positive","stage":"INTERESTED","next_action":"Offer link","confidence":1.7}\n```', policy);
    expect(out).toEqual({ reply: 'Haan ji!', intent: 'Interest', sentiment: 'Positive', stage: 'INTERESTED', nextAction: 'Offer link', confidence: 1, businessCategory: null, personal: false, noDesktop: false });
  });

  it('a personal message is flagged with no reply', () => {
    expect(parseAgentOutput('{"reply":"","intent":"flirting","personal":true}', policy)).toMatchObject({ personal: true, reply: '' });
    expect(parseAgentOutput('{"reply":"","no_desktop":true}', policy)).toMatchObject({ noDesktop: true, stage: 'NOT_INTERESTED' });
  });

  it('strips links the model invented, keeps the configured download URL', () => {
    const out = parseAgentOutput(JSON.stringify({ reply: 'Get it at https://evil.example/x or https://example.com/desktop now', stage: 'DESKTOP_LINK_SENT' }), policy);
    expect(out?.reply).toBe('Get it at or https://example.com/desktop now');
    const noLink = parseAgentOutput(JSON.stringify({ reply: 'Download: https://made-up.example', stage: 'DESKTOP_LINK_SENT' }), { ...policy, desktopDownloadUrl: null });
    expect(noLink?.reply).toBe('Download:');
    expect(noLink?.stage).toBe('INTERESTED'); // can't claim the link was sent
  });

  it('rejects unusable output so the engine falls back', () => {
    expect(parseAgentOutput('Sure! I can help.', policy)).toBeNull();
    expect(parseAgentOutput('{"reply": ""}', policy)).toBeNull();
    expect(parseAgentOutput('{not json}', policy)).toBeNull();
  });

  it('prompt carries the SOP: mapping, exact phrases, persona, business + step context', () => {
    const p = buildSystemPrompt({ customer: { name: null, businessType: null, city: null }, history: [], language: 'hinglish', remainingAfterThis: 5, isFirstReply: true, knowledge: VYAPAR_DESKTOP_KNOWLEDGE, policy, business: detectBusiness('medical store'), step: 'ASKED_BUSINESS', downloadHost: 'vyaparapp.in' });
    expect(p).toContain('Medical shop / Pharmacy: My Online Store, Batch Tracking');
    expect(p).toContain('Tour & Travel: (no specific features — do not invent any)');
    expect(p).toContain('Aapka kis cheez ka business hai? Bata dijiye');
    expect(p).toContain('main aapko batati hoon');
    expect(p).toContain('free trial version');
    expect(p).toContain("Customer's business: Medical shop / Pharmacy");
    expect(p).toMatch(/the customer is not Nisha/i);
    expect(p).toContain('start with "Namaste Sir"');
  });
});

describe('prompt shape', () => {
  it('sends the transcript in ONE user message ending with the JSON instruction (keeps the model in JSON mode)', async () => {
    const { buildMessages } = await import('./agent');
    const msgs = buildMessages({
      customer: { name: 'Rahul', businessType: 'Retail', city: null },
      history: [
        { role: 'assistant', text: 'Hi, Vyapar se' },
        { role: 'user', text: 'haan batao' },
        { role: 'assistant', text: 'Desktop is great' },
        { role: 'user', text: 'free hai kya?' },
      ],
      language: 'hinglish',
      remainingAfterThis: 5,
      isFirstReply: false,
      knowledge: VYAPAR_DESKTOP_KNOWLEDGE,
      policy,
    });
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user']);
    expect(msgs[1].content).toContain('CUSTOMER: haan batao\nVYAPAR: Desktop is great\nCUSTOMER: free hai kya?');
    expect(msgs[1].content).toMatch(/latest message \("free hai kya\?"\)\. Respond with ONLY the JSON object/);
  });
});

describe('house style (enforced in code)', () => {
  it('first reply: exactly one "Namaste Sir" greeting, never the customer name, no filler', () => {
    expect(
      enforceStyle('Namaste Manish! Aapka mobile app use karne ke liye dhanyavaad. Kya aapko pata hai Vyapar Desktop se aap billing badi screen par kar sakte hain?', true),
    ).toBe('Namaste Sir\n\nVyapar Desktop se aap billing badi screen par kar sakte hain?');
  });
  it('later replies: no greeting at all, no emojis', () => {
    expect(enforceStyle('Namaste ji! Haan, free version hai 😊\n\n\n\nKya aap download karna chahenge? 🙂', false)).toBe('Haan, free version hai\n\nKya aap download karna chahenge?');
    expect(enforceStyle('Hello Sir, GST reports bhi milte hain.', false)).toBe('GST reports bhi milte hain.');
    expect(enforceStyle('Haan Sir, main Vyapar ka AI assistant hoon. Aapki kisi bhi sawal ke liye main yahan hoon.', false)).toBe('Haan Sir, main Vyapar ka AI assistant hoon.');
  });
  it('the prompt asks for a greeting only on the first reply', () => {
    const base = { customer: { name: null, businessType: null, city: null }, history: [], language: 'hinglish' as const, remainingAfterThis: 5, knowledge: VYAPAR_DESKTOP_KNOWLEDGE, policy };
    expect(buildSystemPrompt({ ...base, isFirstReply: true })).toContain('start with "Namaste Sir"');
    expect(buildSystemPrompt({ ...base, isFirstReply: false })).toContain('Not your first reply: no greeting');
  });
});

describe('style guard', () => {
  it('flags replies that are far too long', async () => {
    const { styleViolation } = await import('./agent');
    expect(styleViolation('Kirana business ke liye desktop version mein multiple billing aur barcode scanning milta hai. Aapke paas desktop ya laptop hai kya?')).toBeNull();
    expect(styleViolation(Array(80).fill('word').join(' '))).toMatch(/80 words/);
    // The SOP's own Manufacturing example (5 list items) is fine; the 8-feature dump seen live is not.
    expect(styleViolation('Manufacturing business ke liye Vyapar ke desktop version mein aap badi screen par BOM, manufacturing report aur consumption report jaise features use kar sakte ho. Stock ko batch, serial number, expiry date aur manufacturing date ke hisaab se bhi track kar sakte ho. Aapke paas desktop ya laptop hai kya?')).toBeNull();
    expect(styleViolation('Medical shop ke liye aap My Online Store, Batch Tracking, Expiry date aur Manufacturing date jaise features use kar sakte ho. Batch number, Multiple Billing, Barcode Scanning aur Show Profit bhi useful hain.')).toMatch(/too many features/);
  });
  it('asks the model once to rewrite a reply that is too long', async () => {
    const { runAgent } = await import('./agent');
    const drafts = [
      JSON.stringify({ reply: Array(80).fill('lamba').join(' '), stage: 'INTERESTED' }),
      JSON.stringify({ reply: 'Kirana ke liye multiple billing aur barcode scanning milta hai.\n\nAapke paas desktop ya laptop hai kya?', stage: 'INTERESTED', business_category: 'retail' }),
    ];
    const calls: number[] = [];
    const llm = { name: 'fake', complete: async (m: unknown[]) => (calls.push(m.length), { text: drafts.shift()!, model: 'fake', inputTokens: 1, outputTokens: 1, latencyMs: 5 }) };
    const { output } = await runAgent(llm, { customer: { name: null, businessType: null, city: null }, history: [{ role: 'user', text: 'kirana' }], language: 'hinglish', remainingAfterThis: 5, isFirstReply: false, knowledge: VYAPAR_DESKTOP_KNOWLEDGE, policy });
    expect(calls).toEqual([2, 4]);
    expect(output?.businessCategory).toBe('retail');
  });
});

describe('language guard', () => {
  it('asks for an English rewrite when an English customer gets a Hinglish reply', async () => {
    const { runAgent } = await import('./agent');
    const drafts = [
      JSON.stringify({ reply: 'Clothing store ke liye aap size-wise stock track kar sakte ho. Aapke paas desktop ya laptop hai kya?', stage: 'INTERESTED' }),
      JSON.stringify({ reply: 'For your clothing store, you can track stock by size and colour on a bigger screen. Do you have a desktop or laptop?', stage: 'INTERESTED' }),
    ];
    const llm = { name: 'fake', complete: async () => ({ text: drafts.shift()!, model: 'fake', inputTokens: 1, outputTokens: 1, latencyMs: 5 }) };
    const { output } = await runAgent(llm, { customer: { name: null, businessType: null, city: null }, history: [{ role: 'user', text: 'I run a clothing store' }], language: 'en', remainingAfterThis: 5, isFirstReply: false, knowledge: VYAPAR_DESKTOP_KNOWLEDGE, policy });
    expect(output?.reply).toMatch(/^For your clothing store/);
  });
});
