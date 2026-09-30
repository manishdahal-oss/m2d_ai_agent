/**
 * The approved WhatsApp opening template (owner, 2026-09-30) and helpers for its {{1}}, {{2}}… variables.
 * Variables are positional: an empty one is still sent (as a blank), so {{2}} never shifts into {{1}}.
 */

export const DEFAULT_TEMPLATE = {
  name: 'support_m2d',
  language: 'en',
  text: 'Hi {{1}},\n\nMera name Nisha hai, Aapne Vyapar mobile app par {{2}} kiya hai.\n\nAgar is process mein aapko koi problem aa rahi hai,',
  /** {{1}} blank (no name), {{2}} = INSTALL */
  params: ['', 'INSTALL'],
};

/** Our agent's name, as introduced in the template. */
export const AGENT_NAME = 'Nisha';

/** Number of positional variables ({{1}}…{{n}}) the template text uses. */
export function placeholderCount(text: string): number {
  let max = 0;
  for (const m of text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) max = Math.max(max, Number(m[1]));
  return Math.min(max, 20);
}

/** The template as the customer sees it: variables filled in, "Hi ," tidied to "Hi,". */
export function fillTemplate(text: string, params: string[]): string {
  return text
    .replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => (params[Number(n) - 1] ?? '').trim())
    .replace(/[ \t]+([,.!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
