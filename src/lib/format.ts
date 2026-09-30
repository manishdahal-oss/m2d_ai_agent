const nf = new Intl.NumberFormat('en-IN');
export const fmtNumber = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));

export const fmtPct = (n: number | null | undefined, digits = 1) =>
  n == null || !Number.isFinite(n) ? '—' : `${(n * 100).toFixed(n > 0 && n < 0.001 ? 2 : digits)}%`;

export const ratio = (a: number, b: number) => (b ? a / b : null);

/** +919876543210 → +91 98765 43210 */
export function fmtPhone(e164: string | null | undefined): string {
  if (!e164) return '—';
  const m = e164.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

const dtf = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const df = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const tf = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' });

/** Accepts epoch milliseconds (Convex) or ISO strings. */
type When = number | string | null | undefined;
export const fmtDateTime = (t: When) => (t ? dtf.format(new Date(t)) : '—');
export const fmtDate = (t: When) => (t ? df.format(new Date(t)) : '—');
export const fmtTime = (t: When) => (t ? tf.format(new Date(t)) : '');

export function fmtRelative(t: When): string {
  if (!t) return '—';
  const diff = (Date.now() - new Date(t).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(t);
}

export const initials = (name: string | null | undefined) =>
  (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '?';
