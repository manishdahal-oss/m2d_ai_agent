import type { ReactNode, SelectHTMLAttributes } from 'react';
import { AlertTriangle, Inbox, Loader2, Search } from 'lucide-react';

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, description, actions, children, className = '' }: { title?: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
const BTN: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-ink hover:brightness-110',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
};

export function buttonClass(variant: ButtonVariant = 'secondary', extra = '') {
  return `inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 ${BTN[variant]} ${extra}`;
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative flex min-w-0 flex-1 items-center sm:max-w-xs">
      <Search size={16} className="pointer-events-none absolute left-3 text-ink-3" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm outline-none placeholder:text-ink-3 focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
    </label>
  );
}

export function Select({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="flex min-w-0 max-w-full items-center gap-2 text-sm">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        {...props}
        className="w-full max-w-[16rem] truncate rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      >
        {children}
      </select>
    </label>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-3" role="status">
      <Loader2 size={16} className="animate-spin" /> {label}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-critical/30 bg-critical/5 px-4 py-3 text-sm">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-critical" />
      <div>
        <p className="font-medium">Something went wrong</p>
        <p className="text-ink-2">{error instanceof Error ? error.message : String(error)}</p>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-ink-3">{icon ?? <Inbox size={20} />}</div>
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-ink-2">{children}</div>}
    </div>
  );
}

/** Cursor-based pagination footer for Convex `usePaginatedQuery`. */
export function LoadMore({
  status,
  shown,
  onLoadMore,
  noun = 'items',
}: {
  status: 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted';
  shown: number;
  onLoadMore: () => void;
  noun?: string;
}) {
  if (status === 'LoadingFirstPage') return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm text-ink-2">
      <span className="tabular">
        Showing {shown.toLocaleString('en-IN')} {noun}
        {status === 'Exhausted' ? '' : '…'}
      </span>
      {status !== 'Exhausted' && (
        <button className={buttonClass('secondary')} onClick={onLoadMore} disabled={status === 'LoadingMore'}>
          {status === 'LoadingMore' ? <Loader2 size={15} className="animate-spin" /> : null}
          Load more
        </button>
      )}
    </div>
  );
}

export function KeyValue({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[minmax(0,auto)_1fr] gap-x-6 gap-y-2.5 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className="min-w-0 break-words text-ink">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Avatar({ name, className = "" }: { name?: string | null; className?: string }) {
  const init = (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand ${className}`} aria-hidden>
      {init}
    </span>
  );
}
