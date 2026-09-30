import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { fmtNumber } from '../lib/format.ts';

interface Props {
  label: string;
  value: number | null | undefined;
  hint?: ReactNode;
  to?: string;
  emphasis?: ReactNode; // e.g. a status icon for "Needs human"
}

/** A headline number. Not a chart — a single value reads fastest as text. */
export function StatTile({ label, value, hint, to, emphasis }: Props) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-2">{label}</span>
        {emphasis}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular">{fmtNumber(value)}</div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </>
  );
  const cls = 'block rounded-xl border border-line bg-surface px-4 py-3.5';
  return to ? (
    <Link to={to} className={`${cls} transition hover:border-brand/50 focus-visible:outline-2 focus-visible:outline-brand`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
