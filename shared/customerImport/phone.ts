import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

export type PhoneResult = { ok: true; e164: string } | { ok: false; reason: string };

/**
 * Normalise a phone number to E.164, defaulting to India (+91).
 * Rejects numbers that cannot be WhatsApp mobiles (landlines, wrong length, etc.).
 */
export function normalizePhone(raw: string | null | undefined, defaultCountry: 'IN' = 'IN'): PhoneResult {
  const input = (raw ?? '').trim();
  if (!input) return { ok: false, reason: 'Missing phone number' };

  // Excel often turns numbers into "9.19876543210E+11" or "919876543210.0".
  let cleaned = input;
  if (/^\d+(\.\d+)?e\+\d+$/i.test(cleaned)) cleaned = Number(cleaned).toFixed(0);
  cleaned = cleaned.replace(/\.0+$/, '');
  // 00-prefixed international format.
  cleaned = cleaned.replace(/^00/, '+');
  // A bare 12-digit number starting with 91 is almost certainly +91XXXXXXXXXX.
  const digits = cleaned.replace(/\D/g, '');
  if (!cleaned.startsWith('+') && digits.length === 12 && digits.startsWith('91')) cleaned = `+${digits}`;
  if (!cleaned.startsWith('+') && digits.length === 11 && digits.startsWith('0')) cleaned = digits.slice(1);

  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
  if (!parsed) return { ok: false, reason: 'Not a phone number' };
  if (!parsed.isValid()) return { ok: false, reason: 'Invalid number' };
  const type = parsed.getType();
  if (type && type !== 'MOBILE' && type !== 'FIXED_LINE_OR_MOBILE') {
    return { ok: false, reason: `Not a mobile number (${type.toLowerCase().replace(/_/g, ' ')})` };
  }
  return { ok: true, e164: parsed.number };
}
