import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation, usePaginatedQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Loader2, Trash2, Upload, Users, X } from 'lucide-react';
import { CONVERSATION_STATES, STATE_META } from '../../shared/conversationStates.ts';
import { LANGUAGES, languageName } from '../../shared/languages.ts';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { isConversationState } from '../../shared/conversationStates.ts';
import { fmtPhone, fmtRelative } from '../lib/format.ts';
import { DesktopBadge, EligibilityBadge, StateBadge } from '../components/StateBadge.tsx';
import { EmptyState, LoadMore, Loading, PageHeader, SearchInput, Section, Select, buttonClass } from '../components/ui.tsx';

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const ELIGIBILITY = ['ELIGIBLE', 'ASSIGNED_TO_HUMAN', 'DESKTOP_ALREADY_ACTIVE', 'OPTED_OUT'] as const;
type Eligibility = (typeof ELIGIBILITY)[number];

export function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [q, setQ] = useState(params.get('q') ?? '');
  const debouncedQ = useDebounced(q);
  const rawEligibility = params.get('eligibility') ?? '';
  const eligibility = (ELIGIBILITY.includes(rawEligibility as Eligibility) ? rawEligibility : rawEligibility === 'eligible' ? 'ELIGIBLE' : '') as Eligibility | '';
  const language = params.get('language') ?? '';
  const rawState = params.get('state') ?? '';
  const state = isConversationState(rawState) ? rawState : undefined;
  const rawDesktop = params.get('desktop');
  const desktop = rawDesktop === 'YES' || rawDesktop === 'NO' || rawDesktop === 'UNCONFIRMED' ? rawDesktop : undefined;

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if ((params.get('q') ?? '') !== debouncedQ) set('q', debouncedQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  // Live, cursor-paginated: new imports and state changes appear without a refresh.
  const { results, status, loadMore } = usePaginatedQuery(
    api.customers.list,
    { q: debouncedQ || undefined, eligibility: eligibility || undefined, language: language || undefined, state, desktop },
    { initialNumItems: 25 },
  );

  const filtered = !!(debouncedQ || eligibility || language || state || desktop);

  // ── Selection + delete ──
  const deleteCustomers = useMutation(api.cleanup.deleteCustomers);
  const [selected, setSelected] = useState<Set<Id<'customers'>>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);
  const toggle = (id: Id<'customers'>) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allShownSelected = results.length > 0 && results.every((c) => selected.has(c._id));
  const toggleAll = () => setSelected(allShownSelected ? new Set() : new Set(results.map((c) => c._id)));
  const runDelete = async () => {
    setDeleting(true);
    setDeleteResult(null);
    try {
      const ids = [...selected];
      let deleted = 0;
      const kept: Array<{ name: string; reason: string }> = [];
      for (let i = 0; i < ids.length; i += 200) {
        const r = await deleteCustomers({ ids: ids.slice(i, i + 200) });
        deleted += r.deleted;
        kept.push(...r.kept);
      }
      const reasons = [...new Set(kept.map((k) => k.reason))];
      setDeleteResult(`Deleted ${deleted} contact${deleted === 1 ? '' : 's'}.${kept.length ? ` Kept ${kept.length}: ${reasons.join('; ')}.` : ''}`);
      setSelected(new Set());
      setConfirmDelete(false);
    } catch (err) {
      setDeleteResult(err instanceof ConvexError ? String(err.data) : err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Customers"
        description="Uploaded Vyapar mobile customers and their campaign eligibility"
        actions={
          <Link to="/customers/import" className={buttonClass('primary')}>
            <Upload size={16} /> Upload CSV
          </Link>
        }
      />

      <Section>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, phone, city, customer ID" />
          <Select label="Eligibility" value={eligibility} onChange={(e) => set('eligibility', e.target.value)}>
            <option value="">All eligibility</option>
            <option value="ELIGIBLE">Eligible</option>
            <option value="ASSIGNED_TO_HUMAN">Assigned to Technotask</option>
            <option value="DESKTOP_ALREADY_ACTIVE">Already on Desktop</option>
            <option value="OPTED_OUT">Opted out</option>
          </Select>
          <Select label="Language" value={language} onChange={(e) => set('language', e.target.value)}>
            <option value="">All languages</option>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
            <option value="unknown">Unknown</option>
          </Select>
          <Select label="Desktop / laptop" value={desktop ?? ''} onChange={(e) => set('desktop', e.target.value)}>
            <option value="">Desktop: any</option>
            <option value="YES">Has desktop</option>
            <option value="NO">No desktop</option>
            <option value="UNCONFIRMED">Unconfirmed</option>
          </Select>
          <Select label="Conversation status" value={state ?? ''} onChange={(e) => set('state', e.target.value)}>
            <option value="">Any status</option>
            {CONVERSATION_STATES.map((s) => (
              <option key={s} value={s}>
                {STATE_META[s].label}
              </option>
            ))}
          </Select>
        </div>

        {status === 'LoadingFirstPage' ? (
          <Loading />
        ) : results.length === 0 ? (
          <EmptyState icon={<Users size={20} />} title={filtered ? 'No customers match these filters' : 'No customers yet'}>
            {filtered ? 'Try clearing a filter.' : 'Upload a CSV to get started.'}
          </EmptyState>
        ) : (
          <>
            {(selected.size > 0 || deleteResult) && (
              <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-5 py-2.5 text-sm" role="region" aria-label="Selection">
                {selected.size > 0 && (
                  <>
                    <span className="font-medium">{selected.size} selected</span>
                    {!confirmDelete ? (
                      <button className={buttonClass('secondary', 'border-critical/50 py-1.5 text-critical hover:bg-critical/5')} onClick={() => setConfirmDelete(true)}>
                        <Trash2 size={15} /> Delete selected
                      </button>
                    ) : (
                      <>
                        <span className="text-ink-2">Delete permanently? Opted-out and already-messaged contacts are kept automatically.</span>
                        <button className={buttonClass('primary', 'bg-critical py-1.5 text-white')} disabled={deleting} onClick={() => void runDelete()}>
                          {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Yes, delete {selected.size}
                        </button>
                        <button className={buttonClass('ghost', 'py-1.5')} onClick={() => setConfirmDelete(false)}>
                          Cancel
                        </button>
                      </>
                    )}
                    <button className={buttonClass('ghost', 'ml-auto py-1.5')} onClick={() => (setSelected(new Set()), setConfirmDelete(false))}>
                      <X size={15} /> Clear selection
                    </button>
                  </>
                )}
                {deleteResult && selected.size === 0 && (
                  <>
                    <span role="status">{deleteResult}</span>
                    <button className={buttonClass('ghost', 'ml-auto py-1.5')} onClick={() => setDeleteResult(null)} aria-label="Dismiss">
                      <X size={15} />
                    </button>
                  </>
                )}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-3">
                    <th className="w-10 py-2.5 pl-5">
                      <input type="checkbox" aria-label="Select all shown customers" checked={allShownSelected} onChange={toggleAll} />
                    </th>
                    <th className="px-3 py-2.5 font-medium">Customer</th>
                    <th className="px-3 py-2.5 font-medium">Language</th>
                    <th className="px-3 py-2.5 font-medium">Business</th>
                    <th className="px-3 py-2.5 font-medium">Desktop / laptop</th>
                    <th className="px-3 py-2.5 font-medium">Eligibility</th>
                    <th className="px-3 py-2.5 font-medium">Conversation</th>
                    <th className="px-5 py-2.5 text-right font-medium">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((c) => (
                    <tr
                      key={c._id}
                      onClick={() => navigate(`/customers/${c._id}`)}
                      className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2"
                    >
                      <td className="w-10 py-3 pl-5" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Select ${c.name ?? c.phone}`} checked={selected.has(c._id)} onChange={() => toggle(c._id)} />
                      </td>
                      <td className="px-3 py-3">
                        <Link to={`/customers/${c._id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {c.name ?? 'Unnamed'}
                        </Link>
                        <div className="font-mono text-xs text-ink-3">{fmtPhone(c.phone)}</div>
                      </td>
                      <td className="px-3 py-3 text-ink-2">{languageName(c.language)}</td>
                      <td className="px-3 py-3 text-ink-2">
                        {c.businessType ?? '—'}
                        {c.city && <div className="text-xs text-ink-3">{c.city}</div>}
                      </td>
                      <td className="px-3 py-3">
                        <DesktopBadge value={c.hasDesktop} />
                      </td>
                      <td className="px-3 py-3">
                        <EligibilityBadge eligibility={c.eligibility} />
                      </td>
                      <td className="px-3 py-3">
                        <StateBadge state={c.latestState} />
                      </td>
                      <td className="px-5 py-3 text-right text-ink-2">{fmtRelative(c.lastActivityAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <LoadMore status={status} shown={results.length} onLoadMore={() => loadMore(50)} noun="customers" />
          </>
        )}
      </Section>
    </>
  );
}
