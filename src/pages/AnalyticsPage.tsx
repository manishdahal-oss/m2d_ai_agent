import { useSearchParams } from 'react-router';
import { X } from 'lucide-react';
import { STATE_META } from '../../shared/conversationStates.ts';
import { languageName } from '../../shared/languages.ts';
import type { Id } from '../../convex/_generated/dataModel';
import { useAnalytics, type AnalyticsFilters } from '../lib/convex.ts';
import { fmtNumber, fmtPct, ratio } from '../lib/format.ts';
import { Funnel } from '../components/Funnel.tsx';
import { StateBadge } from '../components/StateBadge.tsx';
import { StatTile } from '../components/StatTile.tsx';
import { ErrorState, Loading, PageHeader, Section, Select, buttonClass } from '../components/ui.tsx';

const inputCls = 'rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';

export function AnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const filters: AnalyticsFilters = {
    campaignId: (params.get('campaignId') || undefined) as Id<'campaigns'> | undefined,
    language: params.get('language') || undefined,
    segment: params.get('segment') || undefined,
    from: params.get('from') || undefined,
    to: params.get('to') || undefined,
  };
  const set = (key: keyof AnalyticsFilters, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const active = Object.values(filters).some(Boolean);

  const query = useAnalytics(filters);

  const stage = (k: string) => query.data?.funnel.find((s) => s.key === k)?.count ?? 0;
  const maxState = Math.max(1, ...(query.data?.byState.map((s) => s.count) ?? [1]));

  return (
    <>
      <PageHeader title="Analytics" description="How many customers moved from mobile to Desktop — and where they dropped off" />

      {/* Filters: one row above the charts */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Select label="Campaign" value={filters.campaignId ?? ''} onChange={(e) => set('campaignId', e.target.value)}>
          <option value="">All campaigns</option>
          {query.data?.options.campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select label="Language" value={filters.language ?? ''} onChange={(e) => set('language', e.target.value)}>
          <option value="">All languages</option>
          {query.data?.options.languages.map((l) => (
            <option key={l} value={l}>
              {languageName(l)}
            </option>
          ))}
        </Select>
        <Select label="Customer segment" value={filters.segment ?? ''} onChange={(e) => set('segment', e.target.value)}>
          <option value="">All segments</option>
          {query.data?.options.segments.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-1.5 text-sm text-ink-2">
          Contacted from
          <input type="date" aria-label="From date" value={filters.from ?? ''} onChange={(e) => set('from', e.target.value)} className={inputCls} />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-ink-2">
          to
          <input type="date" aria-label="To date" value={filters.to ?? ''} onChange={(e) => set('to', e.target.value)} className={inputCls} />
        </label>
        {active && (
          <button onClick={() => setParams({}, { replace: true })} className={buttonClass('ghost')}>
            <X size={15} /> Clear
          </button>
        )}
      </div>

      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <div className={`space-y-6 transition-opacity ${query.isFetching ? 'opacity-70' : ''}`}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Contacted" value={stage('contacted')} hint={`of ${fmtNumber(stage('eligible'))} eligible`} />
            <StatTile label="Replied" value={stage('replied')} hint={`${fmtPct(ratio(stage('replied'), stage('contacted')))} reply rate`} />
            <StatTile label="Desktop activated" value={stage('activated')} hint={`${fmtNumber(stage('linkClicked'))} clicked the link`} />
            <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
              <span className="text-xs font-medium text-ink-2">Conversion rate</span>
                <div className="mt-2 text-2xl font-semibold tracking-tight tabular">{fmtPct(query.data.conversionRate)}</div>
              <div className="mt-1 text-xs text-ink-3">Desktop activations ÷ eligible customers</div>
            </div>
          </div>

          <Section title="Funnel" description="Distinct customers reaching each milestone. Later stages count even if the conversation moved on (e.g. to Needs human).">
            <div className="px-4 pb-4 pt-3 sm:px-5">
              <Funnel stages={query.data.funnel} />
            </div>
          </Section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Section title="By language">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-3">
                      <th className="px-5 py-2 font-medium">Language</th>
                      <th className="px-3 py-2 text-right font-medium">Eligible</th>
                      <th className="px-3 py-2 text-right font-medium">Contacted</th>
                      <th className="px-3 py-2 text-right font-medium">Replied</th>
                      <th className="px-3 py-2 text-right font-medium">Interested</th>
                      <th className="px-5 py-2 text-right font-medium">Activated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.byLanguage.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-6 text-center text-ink-3">
                          No data for these filters
                        </td>
                      </tr>
                    ) : (
                      query.data.byLanguage.map((r) => (
                        <tr key={r.language ?? 'unknown'} className="border-b border-line last:border-0">
                          <td className="px-5 py-2">{r.language ? languageName(r.language) : 'Unknown'}</td>
                          <td className="px-3 py-2 text-right tabular">{fmtNumber(r.eligible)}</td>
                          <td className="px-3 py-2 text-right tabular">{fmtNumber(r.contacted)}</td>
                          <td className="px-3 py-2 text-right tabular">{fmtNumber(r.replied)}</td>
                          <td className="px-3 py-2 text-right tabular">{fmtNumber(r.interested)}</td>
                          <td className="px-5 py-2 text-right tabular">{fmtNumber(r.activated)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Current conversation status">
              {query.data.byState.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-ink-3">No conversations for these filters</p>
              ) : (
                <ul className="space-y-[2px] px-5 py-4">
                  {query.data.byState.map((s) => (
                    <li key={s.state} className="grid grid-cols-[9.5rem_1fr_2.5rem] items-center gap-3 py-1" title={STATE_META[s.state].description}>
                      <StateBadge state={s.state} />
                      <span className="relative h-3">
                        <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-series-1" style={{ width: `${(s.count / maxState) * 100}%` }} />
                      </span>
                      <span className="text-right text-sm font-medium tabular">{s.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </div>
      )}
    </>
  );
}
