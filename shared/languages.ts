/**
 * Supported conversation languages. English and Hindi are enabled for the MVP;
 * the rest are registered so data can be imported/tagged now and switched on later
 * (enabling a language = approved knowledge-base content + template in that language).
 */
export interface LanguageDef {
  code: string; // ISO 639-1
  name: string;
  nativeName: string;
  enabled: boolean;
  /** Values seen in CSVs that should map to this language (lower-case). */
  aliases: string[];
}

export const LANGUAGES: LanguageDef[] = [
  { code: 'en', name: 'English', nativeName: 'English', enabled: true, aliases: ['english', 'eng', 'en-in', 'en_in'] },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', enabled: true, aliases: ['hindi', 'hin', 'hi-in', 'hinglish', 'हिंदी', 'हिन्दी'] },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', enabled: false, aliases: ['kannada', 'kan'] },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', enabled: false, aliases: ['marathi', 'mar'] },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', enabled: false, aliases: ['gujarati', 'guj'] },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', enabled: false, aliases: ['tamil', 'tam'] },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', enabled: false, aliases: ['telugu', 'tel'] },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', enabled: false, aliases: ['bengali', 'bangla', 'ben'] },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', enabled: false, aliases: ['malayalam', 'mal'] },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', enabled: false, aliases: ['punjabi', 'pan'] },
];

export const DEFAULT_LANGUAGE = 'en';

export function normalizeLanguage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  const hit = LANGUAGES.find((l) => l.code === v || l.aliases.includes(v) || l.name.toLowerCase() === v);
  return hit?.code ?? null;
}

export function languageName(code: string | null | undefined): string {
  if (!code) return '—';
  return LANGUAGES.find((l) => l.code === code)?.name ?? code;
}
