/**
 * M2D WhatsApp Conversation SOP (owner, 2026-09-30) — the deterministic parts.
 *
 *   opening (template) → ask business type → recommend 2–4 mapped features + "desktop ya laptop hai kya?"
 *     → yes: download from vyaparapp.in + full demo + helpline
 *     → no:  "desktop/laptop lene ka plan hai?" → yes / no (polite close)
 *   Questions are answered first at any step; "not interested" ends politely; person/call → helpline.
 *
 * Where the SOP gives exact wording, it is used verbatim here. The step we are at is read from our
 * own last message, so no extra state is needed and it can never drift.
 */
import { BUSINESS_CATEGORIES, DEVICE_QUESTION_EN, DEVICE_QUESTION_HI, detectBusiness, type BusinessCategory } from './knowledge/businessFeatures.ts';
import type { Lang } from './replyPolicy.ts';

export interface SopConfig {
  helpline: string; // e.g. 9333911911
  downloadHost: string; // e.g. vyaparapp.in
}

export type SopStep = 'START' | 'ASKED_BUSINESS' | 'ASKED_DEVICE' | 'ASKED_PLAN' | 'DOWNLOAD_SHARED' | 'CLOSED';

const en = (lang: Lang) => lang === 'en';

export const SOP = {
  askBusiness: (lang: Lang) =>
    en(lang)
      ? 'What type of business do you have? Please let me know. Vyapar has some useful features, and I can tell you which ones may be useful for you.'
      : 'Aapka kis cheez ka business hai? Bata dijiye, Vyapar ke kuch acche features hain, main aapko batati hoon.',
  deviceQuestion: (lang: Lang) => (en(lang) ? DEVICE_QUESTION_EN : DEVICE_QUESTION_HI),
  hasDevice: (lang: Lang, c: SopConfig) =>
    en(lang)
      ? `Okay. Please download the Vyapar Desktop version from ${c.downloadHost}. After that, our team will provide you with a full demo. If you face any difficulty, you can call us at ${c.helpline}.`
      : `Theek hai. Aap Vyapar ka Desktop version ${c.downloadHost} se download kijiyega. Uske baad hum aapko full demo denge. Agar kuch dikkat ho to ${c.helpline} par call kijiye.`,
  askPlan: (lang: Lang) =>
    en(lang) ? 'Okay. Are you planning to purchase a desktop or laptop in the near future?' : 'Theek hai. Kya aap aane wale time mein desktop ya laptop lene ka plan kar rahe hain?',
  planYes: (lang: Lang) =>
    en(lang)
      ? 'Okay, whenever you get a desktop or laptop, you can use the Vyapar Desktop version as well.'
      : 'Theek hai, jab aap desktop ya laptop lein, tab aap Vyapar ka Desktop version bhi use kar sakte hain.',
  planNo: (lang: Lang) => (en(lang) ? 'Okay, no problem. You can continue using the Vyapar mobile app.' : 'Theek hai, koi baat nahi. Aap Vyapar mobile app ka use continue kar sakte hain.'),
  notInterested: (lang: Lang) => (en(lang) ? 'Sure, no problem. Thank you for your time.' : 'Theek hai, koi baat nahi. Aapke time ke liye dhanyavaad.'),
  person: (lang: Lang, c: SopConfig) =>
    en(lang) ? `Of course. You can call ${c.helpline}, our team will help you.` : `Bilkul. Aap ${c.helpline} par call kar sakte hain, hamari team aapki help karegi.`,
  unknown: (lang: Lang) =>
    en(lang)
      ? "I'll get our team to confirm this so you get the exact information."
      : 'Iske baare mein main aapko exact information dene ke liye hamari team se confirm karwa sakti hoon.',
  download: (lang: Lang, c: SopConfig) =>
    en(lang) ? `You can download the Vyapar Desktop version from ${c.downloadHost}.` : `Aap Vyapar ka Desktop version ${c.downloadHost} se download kar sakte hain.`,
  demo: (lang: Lang, c: SopConfig) =>
    en(lang)
      ? `After you download the Desktop version, our team will give you a full demo. If you face any difficulty, call ${c.helpline}.`
      : `Desktop version download karne ke baad hum aapko full demo denge. Agar kisi bhi tarah ki dikkat ho to ${c.helpline} par call kar sakte hain.`,
  price: (lang: Lang) =>
    en(lang) ? 'Vyapar Desktop has a free trial version. Would you like to try it?' : 'Vyapar Desktop ka free trial version available hai. Kya aap ise try karna chahenge?',
  travel: (lang: Lang) =>
    en(lang)
      ? `Got it. You can also use the Vyapar Desktop version for your business. ${DEVICE_QUESTION_EN}`
      : `Achha, samajh gaya. Aapke business ke liye desktop version bhi use kar sakte hain. ${DEVICE_QUESTION_HI}`,
};

/** Approved recommendation for a business (SOP example), ending with the device question. */
export function recommendation(cat: BusinessCategory, lang: Lang): string {
  if (!cat.example) return SOP.travel(lang);
  if (!en(lang)) return cat.example;
  const picked = cat.features.slice(0, 3);
  return `For your ${cat.label.toLowerCase()} business, in Vyapar's desktop version you can use features like ${picked.slice(0, -1).join(', ')} and ${picked[picked.length - 1]} on a bigger screen. ${DEVICE_QUESTION_EN}`;
}

/** Where are we in the SOP? Read from our own last message. */
export function currentStep(lastOutbound: string | undefined): SopStep {
  const t = (lastOutbound ?? '').toLowerCase();
  if (!t) return 'START';
  if (/lene ka plan|planning to purchase/.test(t)) return 'ASKED_PLAN';
  if (/desktop ya laptop hai kya|desktop or laptop\?/.test(t)) return 'ASKED_DEVICE';
  if (/kis cheez ka business|business (konsa|kaunsa|kaun sa|kya) hai|kya business (hai|karte)|what type of business|which business|what business/.test(t)) return 'ASKED_BUSINESS';
  if (/full demo/.test(t)) return 'DOWNLOAD_SHARED';
  if (/aapke time ke liye dhanyavaad|thank you for your time|mobile app ka use continue|continue using the vyapar mobile app/.test(t)) return 'CLOSED';
  return 'START';
}

const NO_WORDS = /^(no|nope|nah|nahi+|nahin|nhi|na|nai)\b|\b(nahi hai|nahin hai|nhi hai|nahi he|not have|don'?t have|do not have|no laptop|no desktop|no computer|mobile hi|sirf mobile|only mobile|phone hi)\b|नहीं|नही|ना\b/i;
const YES_WORDS = /^(yes|yeah|yep|ya|haan+|ha+n?|han|ji|ji haan|ji hai|hai|he|hn|sure|ok|okay)\b|\b(hai|he)\s*$|\b(laptop|desktop|computer|pc)\s*(bhi\s*)?(hai|he|h|available)\b|\bi have\b|हाँ|हां|है\s*$|जी/i;

const ANY_NAHI = /\b(nahi+|nahin|nhi|nai)\b|नहीं|नही/i;
const words = (t: string) => t.trim().split(/\s+/).length;
/** A "no" answer. A "nahi" inside a longer sentence ("samajh nahi aa raha") is not a plain no. */
export const answersNo = (text: string) => NO_WORDS.test(text.trim()) || (words(text) <= 5 && ANY_NAHI.test(text));
/** A "yes" answer — never when the message contains a "nahi" anywhere. */
export const answersYes = (text: string) => !ANY_NAHI.test(text) && !answersNo(text) && !/\b(mobile|phone|smartphone|android)\b|मोबाइल|फोन/i.test(text) && YES_WORDS.test(text.trim());

export const NOT_INTERESTED =
  /\b(not interested|no interest|interest nahi|interested nahi|nahi chahiye|nahin chahiye|zarurat nahi|zaroorat nahi|jarurat nahi|need nahi|mat bhejo|no thanks|don'?t want)\b|रुचि नहीं|नहीं चाहिए|ज़रूरत नहीं|जरूरत नहीं/i;

const PRICE = /\b(price|cost|fees?|charges?|kitna|kitne|kitni|paid|free|muft|subscription|rate)\b|फीस|फ़ीस|कीमत|कितना|कितने|पैसे|फ्री/i;
const DOWNLOAD = /\b(download|install|kaha se|kahan se|kaise milega|link)\b|डाउनलोड/i;
const DEMO = /\bdemo\b|डेमो/i;
const QUESTION = /\?|\b(kya|kaise|kaha|kahan|kitna|kyun|kyu|what|how|why|where|which|can|does|is it)\b|क्या|कैसे|कहाँ/i;

export interface SopDecision {
  text: string;
  stage: 'AI_CONVERSATION' | 'INTERESTED' | 'DESKTOP_LINK_SENT' | 'NOT_INTERESTED';
  intent: string;
  step: SopStep;
}

/**
 * Steps with exact SOP wording — handled in code, never by the AI:
 * device yes/no, plan yes/no, not interested.
 */
export function deterministicStep(customerText: string, lastOutbound: string | undefined, lang: Lang, c: SopConfig): SopDecision | null {
  const step = currentStep(lastOutbound);
  const t = customerText.trim();
  if (NOT_INTERESTED.test(t)) return { text: SOP.notInterested(lang), stage: 'NOT_INTERESTED', intent: 'Not interested', step: 'CLOSED' };
  // Questions with an exact SOP answer.
  if (DEMO.test(t)) return { text: SOP.demo(lang, c), stage: 'INTERESTED', intent: 'Demo question', step };
  if (PRICE.test(t) && !answersNo(t) && !/\b(saal|sal|umr|umar|age|baje|time)\b/i.test(t)) return { text: SOP.price(lang), stage: 'INTERESTED', intent: 'Pricing question', step };
  const isQuestion = QUESTION.test(t) && !/^(haan|ha|ji|yes|no|nahi)\b/i.test(t);
  if (step === 'ASKED_DEVICE' && !isQuestion) {
    // "No" here is handled by leaveReason (no reply is sent).
    if (answersYes(t)) return { text: SOP.hasDevice(lang, c), stage: 'DESKTOP_LINK_SENT', intent: 'Has desktop/laptop', step: 'DOWNLOAD_SHARED' };
  }
  if (step === 'ASKED_PLAN' && !isQuestion) {
    if (answersNo(t)) return { text: SOP.planNo(lang), stage: 'NOT_INTERESTED', intent: 'No plan to buy a computer', step: 'CLOSED' };
    if (answersYes(t)) return { text: SOP.planYes(lang), stage: 'INTERESTED', intent: 'Plans to buy a computer', step: 'CLOSED' };
  }
  return null;
}

const NO_BUSINESS = /\b(no business|not have (a |any )?business|don'?t have (a |any )?business|no work|business nahi|business nhi|koi business nahi|koi kaam nahi|kaam nahi)\b|बिज़नेस नहीं|बिजनेस नहीं|कोई काम नहीं/i;

/**
 * Owner rule (2026-09-30): when we asked the business type and they say they have none, or we asked
 * about a desktop/laptop and they say no — send nothing more and leave the customer.
 * Only a plain "no" at those two steps; questions and other "no"s are answered as usual.
 */
/**
 * Customer says they have no desktop/laptop, or want to use only the mobile app — at ANY step
 * (owner rule, 2026-09-30: "if customer don't have desktop then do not reply").
 */
const NO_DESKTOP =
  /^\s*(sirf\s*|bas\s*|only\s*)?(mobile|phone|smartphone|smart phone|android)\s*(hi\s*)?(hai|he|h|hain|only|hi)?\s*[.!]*\s*$|\b(desktop|laptop|computer|pc)\s*(bhi\s*)?(nahi|nahin|nhi|nai|nahi hai|nahi he|nhi hai)\b|\b(desktop|laptop|computer|pc)\s*(par|pe|per|mein|me)?\s*(nahi|nahin|nhi)\s*(chahiye|karna|chalana|use)|\b(no|don'?t have (a |any )?|do not have (a |any )?|not have (a |any )?)(desktop|laptop|computer|pc)\b|\bmobile\s*(par|pe|per|mein|me|mai)\s*hi\b|\b(sirf|only|just|bas)\s*mobile\b|\bmobile\s*(app\s*)?(hi\s*)?(chahiye|chalata|chalate|use karta|use karte)\b|\bmobile app (ka|ke|ki)\s*(hi\s*)?(batao|bataye|bataiye|bare|baare)\b|\bmobile\s*(app\s*)?(ka|ke)?\s*(batao|bataye|bataiye)\s*sirf\b|डेस्कटॉप नहीं|लैपटॉप नहीं|कंप्यूटर नहीं|सिर्फ मोबाइल|मोबाइल पर ही/im;

/** "ghar pe koi computer vagera nahi rakha hai" — device word, then a "nahi" within a few words (not a question). */
const NO_DESKTOP_LOOSE = /\b(desktop|laptop|computer|pc)\b.{0,30}\b(nahi+|nahin|nhi|nai)\b|(डेस्कटॉप|लैपटॉप|कंप्यूटर).{0,30}नहीं/i;

export function leaveReason(customerText: string, lastOutbound: string | undefined): string | null {
  const step = currentStep(lastOutbound);
  const t = customerText.trim();
  const asks = /\?|\bkya\s*$/i.test(t);
  if (NO_DESKTOP.test(t) || (NO_DESKTOP_LOOSE.test(t) && !asks)) return 'Customer has no desktop/laptop or wants only the mobile app — left, no reply sent';
  if (step !== 'ASKED_BUSINESS' && step !== 'ASKED_DEVICE') return null;
  const isQuestion = /\?/.test(t) || QUESTION.test(t);
  if (isQuestion) return null;
  if (step === 'ASKED_BUSINESS') {
    if (detectBusiness(t)) return null; // "nahi, medical shop hai" → a real answer
    return answersNo(t) || NO_BUSINESS.test(t) ? 'Customer has no business — left, no reply sent' : null;
  }
  return answersNo(t) ? 'Customer has no desktop/laptop — left, no reply sent' : null;
}

/**
 * Full SOP without AI — used when the AI is unavailable or its output is unusable.
 * Answers common questions first, otherwise moves the SOP forward.
 */
export function sopFallback(customerText: string, customerHistory: string[], lastOutbound: string | undefined, lang: Lang, c: SopConfig): SopDecision {
  const det = deterministicStep(customerText, lastOutbound, lang, c);
  if (det) return det;
  const step = currentStep(lastOutbound);
  const business = detectBusinessFrom([customerText, ...customerHistory]);
  const next = business ? recommendation(business, lang) : SOP.askBusiness(lang);

  if (PRICE.test(customerText)) return { text: SOP.price(lang), stage: 'INTERESTED', intent: 'Pricing question', step };
  if (DEMO.test(customerText)) return { text: SOP.demo(lang, c), stage: 'INTERESTED', intent: 'Demo question', step };
  if (DOWNLOAD.test(customerText)) return { text: `${SOP.download(lang, c)} ${SOP.deviceQuestion(lang)}`, stage: 'DESKTOP_LINK_SENT', intent: 'Download question', step: 'ASKED_DEVICE' };
  return { text: next, stage: business ? 'INTERESTED' : 'AI_CONVERSATION', intent: business ? `Business: ${business.label}` : 'Opening reply', step: business ? 'ASKED_DEVICE' : 'ASKED_BUSINESS' };
}

/** Latest business type the customer mentioned (their newest messages win). */
export function detectBusinessFrom(customerMessagesNewestFirst: string[]): BusinessCategory | null {
  for (const m of customerMessagesNewestFirst) {
    const b = detectBusiness(m);
    if (b) return b;
  }
  return null;
}

/** Compact mapping for the AI prompt. */
export function mappingForPrompt(): string {
  return BUSINESS_CATEGORIES.map((c) => `- ${c.label}: ${c.features.length ? c.features.join(', ') : '(no specific features — do not invent any)'}`).join('\n');
}

const HAS_DEVICE = /\b(laptop|desktop|computer|pc)\s*(bhi\s*)?(hai|he|h|available|hain)\b|\bi (have|own|use) (a |my )?(laptop|desktop|computer|pc)\b|(लैपटॉप|कंप्यूटर|डेस्कटॉप) है/i;

/** What the customer's message tells us about having a desktop/laptop (for the customer flag). */
export function desktopAnswer(customerText: string, lastOutbound: string | undefined): 'YES' | 'NO' | null {
  const t = customerText.trim();
  if (leaveReason(t, lastOutbound)?.includes('no desktop')) return 'NO';
  if (ANY_NAHI.test(t)) return null;
  if (HAS_DEVICE.test(t)) return 'YES';
  if (currentStep(lastOutbound) === 'ASKED_DEVICE' && answersYes(t)) return 'YES';
  return null;
}
