/**
 * Reply rules that run BEFORE (and instead of) the AI. Pure functions — shared by the Convex
 * conversation engine and tests.
 *
 * Order: opt-out → message cap → human request → AI (or the knowledge-only fallback).
 */

export interface ReplyPolicyConfig {
  /** Max outbound messages per customer (template + replies). Meta charges per message. */
  messageLimit: number;
  helpline: string;
  desktopDownloadUrl: string | null;
}

export type Lang = 'en' | 'hinglish' | 'hi';

/** Devanagari → hi; Roman Hindi words → hinglish; else en. */
export function detectLanguage(text: string): Lang {
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  const hinglish = /\b(hai|hain|kya|nahi|nahin|haan|ha|ji|kaise|kitna|kitni|mujhe|aap|aapka|aapke|aapko|appne|aapne|mera|meri|karna|karni|karo|karein|chahiye|bhejo|batao|thik|theek|acha|accha|achha|achchha|kab|kyu|kyun|lekin|abhi|wala|wali|mai|tha|thi|kia|kiya|sath|saath|baat|apne|liye|bhi|hum|humein)\b/i;
  return hinglish.test(text) ? 'hinglish' : 'en';
}

const OPT_OUT = /^\s*(stop|unsubscribe|opt[\s-]?out|cancel|end)\s*[.!]*\s*$|\b(stop (sending|messaging)|don'?t (message|text|contact) me|do not (message|contact) me|no more messages|remove my number|band karo|mat bhejo|message mat karo|msg mat karo|pareshan mat karo)\b|बंद करो|मत भेजो/i;

const HUMAN = /\b(talk|speak|chat) (to|with) (someone|somebody|a person|a human|an agent|agent|executive|team)\b|\b(call me|can (someone|you) call|need (a )?call|call back|callback|customer care|human|real person|executive|agent se|call karo|call kijiye|phone karo|baat karni hai|baat karao|kisi se baat)\b|कॉल करो|बात करनी/i;

export const isOptOut = (text: string) => OPT_OUT.test(text);

/**
 * WhatsApp Business greeting / away messages ("Thank you for contacting X", "We're unavailable
 * right now", shop menus). Owner rule (2026-09-30): never reply to these — wait for the customer's
 * own message. Phrases are ones a person replying to us would not write.
 */
const AUTO_REPLY = [
  /\bthank(s| you) for (contacting|reaching out|your (message|enquiry|inquiry)|messaging|choosing|visiting|connecting)\b/i,
  /\b(we'?re|we are|i'?m|i am|currently) (unavailable|away|not available|closed|offline|out of (the )?office)\b/i,
  /\b(will|shall) (respond|reply|get back)( to you)? (as soon as|shortly|soon|at the earliest|within)\b/i,
  /\b(let us know|tell us) how (we|i) can help\b|\bhow (can|may) (we|i) help you( today)?\b/i,
  /\bwelcome to\b/i,
  /\b(business|working|office) hours\b/i,
  /\b(send|type|reply)\s+\*?[A-Z]{2,}\*?\s+to\b/, // "send *ORDER* to place your order"
  /\bhome delivery (available|service)\b|\bplace your order\b/i,
  /\b(auto[- ]?reply|automated (message|reply|response)|this is an automated)\b/i,
  /sampark karne ke liye dhanyavaad|संपर्क करने के लिए धन्यवाद|में आपका स्वागत है|jald hi (sampark|jawab|reply)|जल्द ही (संपर्क|जवाब)/i,
];

export const isAutoReply = (text: string) => AUTO_REPLY.some((r) => r.test(text));

/**
 * Personal / romantic / flirty messages to the agent. Owner rule (2026-09-30): do not reply.
 * (The AI also flags less obvious ones — see `personal` in the agent output.)
 */
const PERSONAL =
  /\b(i\s*love\s*(you|u)|love\s*(you|u)|luv\s*(you|u)|ily|miss(ing)?\s*(you|u)|kiss|marry\s*me|will you marry|be my (gf|girlfriend|wife)|girlfriend|gf|bf|boyfriend|date with me|go on a date|sexy|hot girl|beautiful|sweetheart|darling|babe|jaan|jaanu|janu|pyaar|pyar|mohabbat|ishq|dost(i)? (karogi|banogi)|friendship (karogi|karoge|karo)|photo (bhejo|send)|send (your )?(pic|photo|selfie)|your (pic|photo|selfie)|video call karo|aap (bahut )?sundar|single ho|married ho|kaha(n)? rehti ho|umar kya|umr kya|age kya|(kitne|kitni) (saal|sal|varsh) k[ie] ho|how old are you|what is your age|your age)\b|आई लव यू|प्यार|जानू|मिस यू/i;

/** Only emojis of love/kisses (e.g. "😘", "❤️❤️"). */
const LOVE_EMOJI_ONLY = /^(?:[\s]|\p{Extended_Pictographic}|\uFE0F|\u200D)+$/u;
const LOVE_EMOJI = /[😘😍🥰😗😙😚💋❤💕💖💗💓💞💘💝💟😻😽]/u;

export const isPersonal = (text: string) => PERSONAL.test(text) || (LOVE_EMOJI_ONLY.test(text) && LOVE_EMOJI.test(text));
export const wantsHuman = (text: string) => HUMAN.test(text);

export function optOutConfirmation(lang: Lang): string {
  return lang === 'en'
    ? "Done — you won't receive any more messages from us. Thank you!"
    : 'Theek hai — ab aapko humari taraf se aur messages nahi aayenge. Dhanyavaad!';
}

/** The last message a customer can receive (message #limit). */
export function closingMessage(lang: Lang, cfg: ReplyPolicyConfig): string {
  const host = cfg.desktopDownloadUrl?.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const link = host ? `\n${host}\n` : ' ';
  return lang === 'en'
    ? `Thank you for your time! Please download the Vyapar Desktop app to manage your business on a bigger screen:${link}\nIf you face any issue, call us on ${cfg.helpline}.`
    : `Aapka samay dene ke liye dhanyavaad! Bade screen par business manage karne ke liye Vyapar Desktop app download karein:${link}\nKoi bhi dikkat ho to ${cfg.helpline} par call karein.`;
}

/**
 * How many outbound messages have been sent → what the next one must be.
 *  - 'normal'  : regular reply
 *  - 'closing' : this reply is the last allowed one → send closingMessage
 *  - 'blocked' : limit already reached → send nothing
 */
export function capDecision(outboundSoFar: number, cfg: ReplyPolicyConfig): 'normal' | 'closing' | 'blocked' {
  if (outboundSoFar >= cfg.messageLimit) return 'blocked';
  if (outboundSoFar === cfg.messageLimit - 1) return 'closing';
  return 'normal';
}

/* ───────── Repeat protection & the download-link rule ───────── */

const norm = (t: string) => t.toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** True if `reply` is the same (or nearly the same) as something we already sent. */
export function isRepeat(reply: string, previous: string[]): boolean {
  const a = norm(reply);
  if (!a) return false;
  const aw = new Set(a.split(' '));
  return previous.some((p) => {
    const b = norm(p);
    if (!b) return false;
    if (a === b) return true;
    if (b.includes(a)) return true; // new reply is contained in something we already sent
    const bw = new Set(b.split(' '));
    const inter = [...aw].filter((w) => bw.has(w)).length;
    // Repeat = most of what we'd say now was already said (catches "same sentence + one extra line").
    return inter / aw.size >= 0.85;
  });
}

/**
 * Language for the reply. Short, language-neutral messages ("ok", "hmm", "yes") inherit the
 * conversation's language (earlier customer messages, else our template) instead of flipping to English.
 */
export function conversationLanguage(latest: string, history: Array<{ role: 'assistant' | 'user'; text: string }>): Lang {
  const own = detectLanguage(latest);
  const words = latest.trim().split(/\s+/).filter(Boolean).length;
  if (own !== 'en' || words > 3) return own;
  for (const h of [...history].reverse()) {
    if (h.role === 'user' && h.text !== latest) {
      const l = detectLanguage(h.text);
      if (l !== 'en' || h.text.trim().split(/\s+/).length > 3) return l;
    }
  }
  const template = history.find((h) => h.role === 'assistant');
  return template ? detectLanguage(template.text) : own;
}
