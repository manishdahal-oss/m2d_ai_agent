/**
 * The M2D WhatsApp agent: builds the prompt from approved knowledge + conversation, calls the
 * LLM, and validates its structured output. Chain-of-thought is never requested or stored.
 */
import type { KnowledgeBase } from '../../shared/types';
import { BUSINESS_CATEGORIES, DEVICE_QUESTION_HI, type BusinessCategory } from '../../shared/knowledge/businessFeatures';
import { detectLanguage, isRepeat, type Lang, type ReplyPolicyConfig } from '../../shared/replyPolicy';
import { mappingForPrompt, type SopStep } from '../../shared/sop';
import type { ChatMessage, LLMProvider } from './provider';

export const PROMPT_VERSION = 'm2d-sop-2026-09-30.5';

export const AGENT_STAGES = ['AI_CONVERSATION', 'INTERESTED', 'DESKTOP_LINK_SENT', 'NOT_INTERESTED', 'NEEDS_HUMAN'] as const;
export type AgentStage = (typeof AGENT_STAGES)[number];

export interface AgentOutput {
  reply: string;
  intent: string;
  sentiment: 'Positive' | 'Neutral' | 'Negative';
  stage: AgentStage;
  nextAction: string;
  confidence: number;
  businessCategory: string | null;
  /** Customer's latest message is personal/romantic/off-topic about the agent → send nothing. */
  personal: boolean;
  /** Customer says they have no desktop/laptop or only want the mobile app → leave them. */
  noDesktop: boolean;
}

export interface AgentInput {
  customer: { name: string | null; businessType: string | null; city: string | null };
  /** Oldest first. 'assistant' = our messages (template + replies), 'user' = customer. */
  history: Array<{ role: 'assistant' | 'user'; text: string }>;
  language: Lang;
  /** Messages we may still send AFTER this reply (0 = this is the last normal reply). */
  remainingAfterThis: number;
  /** True when no reply has been sent yet in this chat (only the template). Only this reply greets. */
  isFirstReply: boolean;
  knowledge: KnowledgeBase;
  policy: ReplyPolicyConfig;
  /** Business type detected so far (SOP mapping key), if any. */
  business?: BusinessCategory | null;
  /** SOP step, read from our last message. */
  step?: SopStep;
  /** Download location as written to customers, e.g. "vyaparapp.in". */
  downloadHost?: string;
}

export function buildSystemPrompt(input: AgentInput): string {
  const host = input.downloadHost ?? 'vyaparapp.in';
  const help = input.policy.helpline;
  const b = input.business ?? null;
  const step = input.step ?? 'START';
  const langRule =
    input.language === 'en'
      ? 'LANGUAGE FOR THIS REPLY: ENGLISH. The customer writes in English — reply ONLY in simple, natural English and use the English versions of the SOP phrases.'
      : 'Default language: natural Hinglish (Hindi in Roman script), like a Vyapar representative on WhatsApp. Not formal Hindi. Use simple words: aap, bata dijiye, business, feature, desktop version, laptop, download, demo, call. Do not switch language unnecessarily.';

  const stepGuide: Record<string, string> = {
    START: b
      ? `The customer already mentioned their business (${b.label}). Recommend 2–4 of its mapped features and ask the device question.`
      : 'The customer has replied to our opening. Next: ask their business type (use the SOP question). Do not pitch features yet.',
    ASKED_BUSINESS: b
      ? `They told us their business: ${b.label}. Recommend 2–4 relevant mapped features in the SOP format, then ask "${DEVICE_QUESTION_HI}"`
      : 'We asked their business type. If they answered with a business, find the closest category in the mapping and recommend 2–4 features, then ask the device question. If unclear, ask ONE short clarification (e.g. "Aap mainly products sell karte hain ya services provide karte hain?").',
    ASKED_DEVICE: 'We asked whether they have a desktop/laptop. (Yes/no answers are handled by the system.) If they asked a question instead, answer it first, then naturally continue.',
    ASKED_PLAN: 'We asked whether they plan to buy a desktop/laptop. If they asked something else, answer it.',
    DOWNLOAD_SHARED: `We already told them to download from ${host} and that they will get a full demo. Just answer their questions; do not pitch again.`,
    CLOSED: 'The conversation was politely closed. Answer briefly if they ask something; do not sell.',
  };

  return `You are a Vyapar representative (a woman — refer to yourself with feminine forms like "main aapko batati hoon", "main confirm karwa sakti hoon") chatting on WhatsApp with an existing Vyapar MOBILE app user. Be personal, respectful, helpful and natural — NOT a generic sales bot.

PURPOSE (M2D SOP): understand the customer's business → tell them the Vyapar Desktop features relevant to THEIR business → ask if they have a desktop/laptop → if yes, guide them to download (demo + support). Answer their questions whenever they ask. Never force it.

APPROVED BUSINESS → FEATURE MAPPING (the ONLY features you may mention; never invent others):
${mappingForPrompt()}

OTHER APPROVED FACTS:
- Vyapar Desktop has a free trial version.
- Desktop lets them use Vyapar on a bigger screen.
- Download: ${host}. After download our team gives a full demo. Support / call: ${help}.

WHERE WE ARE: ${stepGuide[step] ?? stepGuide.START}
${b ? `Customer's business: ${b.label}. Relevant features: ${b.features.length ? b.features.join(', ') : 'none mapped — do not invent any'}.` : 'Customer\'s business: not known yet.'}

EXACT SOP PHRASES (use these words when the situation fits):
- Ask business: "Aapka kis cheez ka business hai? Bata dijiye, Vyapar ke kuch acche features hain, main aapko batati hoon." (English: "What type of business do you have? Please let me know. Vyapar has some useful features, and I can tell you which ones may be useful for you.")
- Recommendation format: "[BUSINESS] ke business ke liye Vyapar ke desktop version mein aap badi screen par [FEATURE 1] aur [FEATURE 2] jaise features use kar sakte ho. Isse aapko [simple business benefit]. ${DEVICE_QUESTION_HI}"
- Example (Kirana): "Kirana business ke liye Vyapar ke desktop version mein aap badi screen par multiple billing, barcode scanning aur sale bill banate waqt profit dekhne jaise features use kar sakte ho. Low stock report aur payment reminder bhi kaafi useful hain. ${DEVICE_QUESTION_HI}"
- Tour & Travel (no mapped features): "Achha, samajh gaya. Aapke business ke liye desktop version bhi use kar sakte hain. ${DEVICE_QUESTION_HI}"
- Download question: "Aap Vyapar ka Desktop version ${host} se download kar sakte hain. ${DEVICE_QUESTION_HI}"
- Demo question: "Desktop version download karne ke baad hum aapko full demo denge. Agar kisi bhi tarah ki dikkat ho to ${help} par call kar sakte hain."
- "Kya hai ye? / Kaun? / Who are you?": "Main Vyapar se baat kar rahi hoon. Aap Vyapar mobile app use karte hain, isliye aapko Vyapar ke desktop version ke baare mein batana tha. Aapka kis cheez ka business hai?"
- Price / fees: "Vyapar Desktop ka free trial version available hai. Kya aap ise try karna chahenge?"
- Feature asked that IS in their mapping: "Ji haan, aapke business ke liye [feature] jaise features available hain. ${DEVICE_QUESTION_HI}"
- Don't know / not in mapping: "Iske baare mein main aapko exact information dene ke liye hamari team se confirm karwa sakti hoon." (then offer the call number ${help}; stage NEEDS_HUMAN)

RULES:
- ${input.isFirstReply ? 'This is your FIRST reply: start with "Namaste Sir" on its own line.' : 'Not your first reply: no greeting (no "Namaste", "Hello"), no thanking — straight to the point.'}
- ${langRule}
- Answer the customer's question FIRST, then continue the SOP naturally.
- ONE question per message. Never ask the same question again if you already asked it and they answered.
- Recommend AT MOST 4 relevant mapped features in total — never the whole list. Keep it short (about 2–3 lines).
- No promotional words ("best software", "amazing", "limited time"). No emojis, no markdown headings.
- Address the customer as "aap"; never by name; the first line of the first reply is "Namaste Sir".
- Lines marked VYAPAR are OUR messages. The opening template introduces us as "Nisha" (you are Nisha) and asks whether they faced any problem after installing the Vyapar mobile app. The customer is not Nisha.
- If the customer says they are facing a problem with the app / installation, acknowledge it briefly and give the support number: "Aap ${help} par call kijiye, hamari team aapki help karegi." Do not try to troubleshoot or guess the cause. If they say there is no problem, continue the SOP (ask their business type).
- NEVER repeat a message you already sent.
- If the customer's LATEST message is personal, romantic, flirty or about you as a person (love, dating, looks, marriage, photos, "where do you live", etc.) and not about their business, the app or Vyapar: set "personal": true and "reply": "" — we will not reply to it.
- If asked whether you are a bot/AI, say honestly that you are Vyapar's AI assistant.
- Never invent features, prices, offers, links or numbers.
- You ONLY talk about Vyapar DESKTOP. Never say anything about the MOBILE app's price, plans, subscription or features (never say it is free). Never explain how to do something inside the app (no steps, menus or options).
- If the customer says they have NO desktop/laptop/computer, or that they only want to use the mobile app: set "no_desktop": true and "reply": "" — we stop messaging them.
- Use the SOP wording for the business question ("Aapka kis cheez ka business hai? ...") — do not rephrase it.

OUTPUT: ONLY a JSON object, no other text:
{"reply": "<message>", "intent": "<short customer intent>", "sentiment": "Positive|Neutral|Negative", "stage": "AI_CONVERSATION|INTERESTED|DESKTOP_LINK_SENT|NOT_INTERESTED|NEEDS_HUMAN", "next_action": "<short>", "confidence": <0..1>, "business_category": "<one of: ${BUSINESS_CATEGORIES.map((c) => c.key).join(', ')}, or null>", "personal": false, "no_desktop": false}`;
}

export function buildMessages(input: AgentInput): ChatMessage[] {
  const c = input.customer;
  const profile = [c.name && `Name: ${c.name}`, c.businessType && `Business: ${c.businessType}`, c.city && `City: ${c.city}`].filter(Boolean).join(', ');
  // The transcript goes inside ONE user message. Replaying it as alternating chat turns makes the
  // model imitate its earlier plain-text replies and stop producing JSON (seen with Nemotron).
  const turns = input.history.slice(-16);
  const latest = [...turns].reverse().find((t) => t.role === 'user');
  const transcript = turns.map((t) => `${t.role === 'user' ? 'CUSTOMER' : 'VYAPAR'}: ${t.text}`).join('\n');
  return [
    { role: 'system', content: buildSystemPrompt(input) },
    {
      role: 'user',
      content: `${profile ? `Customer profile: ${profile}\n\n` : ''}WhatsApp conversation so far:\n${transcript || '(none)'}\n\nWrite Vyapar's next reply to the customer's latest message${latest ? ` ("${latest.text.slice(0, 300)}")` : ''}. Respond with ONLY the JSON object described in the instructions.`,
    },
  ];
}

const URL_RE = /\bhttps?:\/\/[^\s)]+/gi;

const FILLER = [
  /aap(ka|ke)? (vyapar )?mobile app (use|istemaal) karne ke liye (dhanyavaad|shukriya)[.!]?\s*/gi,
  /\bkya aapko pata hai(,| ki)?\s*/gi,
  /main aapki (madad|help) ke liye yahan hoon[.!]?\s*/gi,
  /(aapki|aapke|aapko) (kisi bhi |har )?(sawal|sawaal|sawalon|madad|help|query)[^.!?\n]{0,30}(ke liye )?(main |hum )?(yahan|hamesha) (hoon|hain)[.!]?\s*/gi,
  /\b(i am|i'm) (here|always here) to help( you)?[.!]?\s*/gi,
  /thank(s| you) for using (the )?(vyapar )?mobile app[.!]?\s*/gi,
];
// Greeting word + optional "Sir"/"ji"/a name, then punctuation — never the rest of the sentence.
const GREETING = /^\s*(namaste|namaskar|namaskaar|hello|hi|hey|hii)\b(\s+(sir|ji|madam|ma'am|[A-Z][a-z]+))?\s*[,.!]*\s*/i;

/**
 * House style, enforced in code (the model doesn't always follow the prompt):
 * greeting only on the first reply ("Namaste Sir"), no filler phrases, no emojis, short lines.
 */
export function enforceStyle(reply: string, isFirstReply: boolean): string {
  let out = reply.replace(/\p{Extended_Pictographic}\uFE0F?/gu, '');
  for (const f of FILLER) out = out.replace(f, '');
  while (GREETING.test(out)) out = out.replace(GREETING, '');
  out = out
    .split('\n')
    .map((l) => l.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (out) out = out.charAt(0).toUpperCase() + out.slice(1);
  return isFirstReply && out ? `Namaste Sir\n\n${out}` : out;
}

/** Parse + validate the model's JSON. Returns null if unusable (caller falls back). */
export function parseAgentOutput(raw: string, policy: ReplyPolicyConfig, isFirstReply = false): AgentOutput | null {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  if (obj.personal === true || obj.no_desktop === true) {
    const personal = obj.personal === true;
    return { reply: '', intent: String(obj.intent ?? (personal ? 'Personal message' : 'No desktop/laptop')).slice(0, 80), sentiment: 'Neutral', stage: personal ? 'AI_CONVERSATION' : 'NOT_INTERESTED', nextAction: 'No reply', confidence: 1, businessCategory: null, personal, noDesktop: !personal };
  }
  let reply = typeof obj.reply === 'string' ? obj.reply.trim() : '';
  if (!reply) return null;
  // Never let the model send a link we didn't configure.
  reply = reply.replace(URL_RE, (u) => (policy.desktopDownloadUrl && u.startsWith(policy.desktopDownloadUrl) ? u : '')).replace(/[ \t]{2,}/g, ' ').trim();
  reply = enforceStyle(reply, isFirstReply);
  if (!reply || reply === 'Namaste Sir') return null;
  const stage = AGENT_STAGES.includes(obj.stage as AgentStage) ? (obj.stage as AgentStage) : 'AI_CONVERSATION';
  const sentiment = ['Positive', 'Neutral', 'Negative'].includes(String(obj.sentiment)) ? (obj.sentiment as AgentOutput['sentiment']) : 'Neutral';
  const confidence = Math.max(0, Math.min(1, Number(obj.confidence) || 0.5));
  return {
    reply: reply.slice(0, 1000),
    intent: String(obj.intent ?? 'Unknown').slice(0, 80),
    sentiment,
    stage: stage === 'DESKTOP_LINK_SENT' && !policy.desktopDownloadUrl ? 'INTERESTED' : stage,
    nextAction: String(obj.next_action ?? obj.nextAction ?? '').slice(0, 120),
    confidence,
    businessCategory: BUSINESS_CATEGORIES.some((c) => c.key === obj.business_category) ? String(obj.business_category) : null,
    personal: false,
    noDesktop: false,
  };
}

export const MAX_WORDS = 70;

/** Returns why a reply breaks the house style, or null if it's fine. (SOP recommendations may name 2–4+ features.) */
export function styleViolation(reply: string): string | null {
  const words = reply.split(/\s+/).filter(Boolean).length;
  if (words > MAX_WORDS) return `It has ${words} words — keep it under 50 words.`;
  // Feature dump check: list separators (commas + "aur"/"and"). The SOP's longest approved example has 5.
  const items = (reply.match(/,/g) ?? []).length + (reply.match(/\s(aur|and)\s/gi) ?? []).length;
  if (items > 5) return 'It lists too many features — mention only the 2–4 most relevant ones.';
  return null;
}

export async function runAgent(llm: LLMProvider, input: AgentInput) {
  const messages = buildMessages(input);
  const first = await llm.complete(messages);
  let output = parseAgentOutput(first.text, input.policy, input.isFirstReply);
  let result = first;
  const previous = input.history.filter((h) => h.role === 'assistant').map((h) => h.text);
  const wrongLanguage = (reply: string) => input.language === 'en' && detectLanguage(reply.replace(/^Namaste Sir\s*/i, '')) !== 'en';
  const problem =
    output &&
    !output.personal &&
    !output.noDesktop &&
    (isRepeat(output.reply, previous)
      ? 'You already sent this same message earlier. Answer the customer\'s LATEST message with something NEW.'
      : wrongLanguage(output.reply)
        ? 'The customer writes in English. Rewrite the reply in simple English (keep "Vyapar Desktop" and feature names).'
        : styleViolation(output.reply));
  if (output && problem) {
    // One corrective pass: ask the model to rewrite its own draft within the rules.
    try {
      const retry = await llm.complete([
        ...messages,
        { role: 'assistant', content: first.text },
        { role: 'user', content: `${problem} Rewrite the reply: max 3 short lines, one question. Respond with ONLY the JSON object.` },
      ]);
      const fixed = parseAgentOutput(retry.text, input.policy, input.isFirstReply);
      if (fixed && !styleViolation(fixed.reply) && !isRepeat(fixed.reply, previous) && !wrongLanguage(fixed.reply)) {
        output = fixed;
        result = { ...retry, latencyMs: first.latencyMs + retry.latencyMs };
      }
    } catch {
      /* keep the first draft */
    }
  }
  return { output, result };
}
