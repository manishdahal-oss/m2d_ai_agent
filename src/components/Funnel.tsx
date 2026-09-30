import { useState } from 'react';
import type { FunnelStage } from '../../shared/types.ts';
import { fmtNumber, fmtPct, ratio } from '../lib/format.ts';

/**
 * Conversion funnel as horizontal bars.
 * One series → one hue (series-1), no legend box; values/labels in text ink.
 * Hover or focus a row for the tooltip; a table view carries the same numbers.
 */
export function Funnel({ stages }: { stages: FunnelStage[] }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [active, setActive] = useState<number | null>(null);
  const base = stages[0]?.count ?? 0;
  const max = Math.max(1, ...stages.map((s) => s.count));

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <div role="tablist" aria-label="Funnel view" className="inline-flex rounded-lg border border-line p-0.5 text-xs">
          {(['chart', 'table'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`rounded-md px-2.5 py-1 font-medium capitalize ${view === v ? 'bg-surface-2 text-ink' : 'text-ink-3 hover:text-ink'}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === 'chart' ? (
        <ol className="space-y-[2px]" onMouseLeave={() => setActive(null)}>
          {stages.map((s, i) => {
            const prev = i > 0 ? stages[i - 1].count : null;
            const width = (s.count / max) * 100;
            const isActive = active === i;
            return (
              <li
                key={s.key}
                tabIndex={0}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                aria-label={`${s.label}: ${fmtNumber(s.count)}${i > 0 ? `, ${fmtPct(ratio(s.count, base))} of eligible` : ''}`}
                className={`relative grid grid-cols-[8.5rem_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 outline-none sm:grid-cols-[10rem_1fr_7.5rem] ${
                  isActive ? 'bg-surface-2' : ''
                } focus-visible:ring-2 focus-visible:ring-brand`}
              >
                <span className="truncate text-sm text-ink-2">{s.label}</span>
                <span className="relative h-5">
                  <span
                    className="absolute inset-y-0 left-0 rounded-r-[4px] bg-series-1 transition-[width] duration-500"
                    style={{ width: `${Math.max(width, s.count ? 0.8 : 0)}%` }}
                  />
                </span>
                <span className="text-right text-sm tabular">
                  <span className="font-semibold">{fmtNumber(s.count)}</span>
                  {i > 0 && <span className="ml-2 hidden text-xs text-ink-3 sm:inline">{fmtPct(ratio(s.count, base))}</span>}
                </span>

                {isActive && (
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute left-[9rem] top-full z-10 mt-1 w-56 rounded-lg border border-line bg-surface p-3 text-xs shadow-lg sm:left-[11rem]"
                  >
                    <p className="mb-1.5 font-semibold text-ink">{s.label}</p>
                    <p className="flex justify-between text-ink-2">
                      Customers <span className="font-medium text-ink tabular">{fmtNumber(s.count)}</span>
                    </p>
                    {i > 0 && (
                      <>
                        <p className="flex justify-between text-ink-2">
                          % of eligible <span className="font-medium text-ink tabular">{fmtPct(ratio(s.count, base))}</span>
                        </p>
                        <p className="flex justify-between text-ink-2">
                          From previous step <span className="font-medium text-ink tabular">{fmtPct(ratio(s.count, prev ?? 0))}</span>
                        </p>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-3">
              <th className="py-2 font-medium">Stage</th>
              <th className="py-2 text-right font-medium">Customers</th>
              <th className="py-2 text-right font-medium">% of eligible</th>
              <th className="py-2 text-right font-medium">From previous</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s, i) => (
              <tr key={s.key} className="border-b border-line last:border-0">
                <td className="py-2">{s.label}</td>
                <td className="py-2 text-right tabular">{fmtNumber(s.count)}</td>
                <td className="py-2 text-right tabular">{i ? fmtPct(ratio(s.count, base)) : '—'}</td>
                <td className="py-2 text-right tabular">{i ? fmtPct(ratio(s.count, stages[i - 1].count)) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
