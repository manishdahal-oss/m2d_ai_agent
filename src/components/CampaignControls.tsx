import { useState } from 'react';
import { useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { AlertTriangle, Loader2, Pause, Play } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import type { Campaign } from '../lib/convex.ts';
import { fmtNumber } from '../lib/format.ts';
import { Section, buttonClass } from './ui.tsx';

/** Start / pause + live sending progress for a dashboard campaign. */
export function CampaignControls({ c }: { c: Campaign }) {
  const start = useMutation(api.campaignRun.start);
  const pause = useMutation(api.campaignRun.pause);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enrolled = c.enrolled ?? 0;
  const done = (c.sent ?? 0) + (c.failed ?? 0);
  const pct = enrolled ? Math.round((done / enrolled) * 100) : 0;
  const canStart = c.status === 'READY' || c.status === 'PAUSED';

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setConfirmed(false);
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Sending" description={`Template ${c.providerTemplateName} · ${c.sendRatePerMinute} per minute`}>
      <div className="space-y-4 px-5 py-4 text-sm">
        <div>
          <div className="mb-1.5 flex justify-between text-xs text-ink-2">
            <span>
              {fmtNumber(c.sent ?? 0)} sent · {fmtNumber(c.failed ?? 0)} failed · {fmtNumber(enrolled)} in audience{c.enrollmentDone ? '' : ' (still adding…)'}
            </span>
            <span className="tabular">{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div className="h-full rounded-r-[4px] bg-series-1 transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {c.lastError && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-critical/30 bg-critical/5 px-3 py-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-critical" />
            <span className="min-w-0 break-words">{c.lastError}</span>
          </p>
        )}

        {c.status === 'RUNNING' && (
          <button className={buttonClass('secondary')} disabled={busy} onClick={() => run(() => pause({ campaignId: c._id }))}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Pause size={16} />} Pause sending
          </button>
        )}

        {canStart && (
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-ink-2">
              <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              I confirm this sends real WhatsApp messages to customers using template <code>{c.providerTemplateName}</code>. Customers who reply will get AI answers.
            </label>
            <button className={buttonClass('primary')} disabled={busy || !confirmed} onClick={() => run(() => start({ campaignId: c._id, confirm: true }))}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} {c.status === 'PAUSED' ? 'Resume sending' : 'Start sending'}
            </button>
          </div>
        )}

        {c.status === 'COMPLETED' && <p className="text-ink-2">Finished — everyone in the audience has been attempted. Replies keep being answered automatically.</p>}
        {error && <p className="text-critical">{error}</p>}
      </div>
    </Section>
  );
}
