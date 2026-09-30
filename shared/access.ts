/**
 * Dashboard access allowlist.
 *
 * ALLOWED_EMAILS         comma-separated exact addresses, e.g. "a@vyapar.in,b@gmail.com"
 * ALLOWED_EMAIL_DOMAINS  comma-separated domains, e.g. "vyaparapp.in"
 *
 * Empty lists allow NOBODY (fail closed).
 */
export interface AllowList {
  emails: string[];
  domains: string[];
}

const split = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export function parseAllowList(emails: string | undefined, domains: string | undefined): AllowList {
  return { emails: split(emails), domains: split(domains).map((d) => d.replace(/^@/, '')) };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmailAllowed(email: string | undefined | null, list: AllowList): boolean {
  if (!email) return false;
  const e = normalizeEmail(email);
  const at = e.lastIndexOf('@');
  if (at < 1 || at === e.length - 1) return false;
  return list.emails.includes(e) || list.domains.includes(e.slice(at + 1));
}
