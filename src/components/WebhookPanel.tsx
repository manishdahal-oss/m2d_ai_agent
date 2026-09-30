import { useQuery } from 'convex/react';
import { AlertTriangle, CheckCircle2, CircleDashed } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import type { Settings } from '../lib/convex.ts';
import { fmtRelative } from '../lib/format.ts';
import { KeyValue, Section } from './ui.tsx';

const MODE_LABEL: Record<Settings['engine']['autoReplyMode'], string> = {
  off: 'Off — replies are stored, nothing is sent',
  test_only: 'Test numbers only — replies go only to numbers used in the test sender',
  contacted: 'Live — replies to every customer we messaged first (campaigns + tests)',
  all: 'All customers',
};

/** Webhook URL for Times, auto-reply settings, and the last events Times sent us. */
export function WebhookPanel({ s }: { s: Settings }) {
  const events = useQuery(api.whatsapp.testSend.recentWebhooks);
  const e = s.engine;
  return (
    <Section title="Customer replies · webhook & auto-reply" description="Times calls this URL when a customer replies; the agent answers with a free-text message.">
      <div className="grid grid-cols-1 gap-6 px-5 py-4 lg:grid-cols-2">
        <div className="space-y-3">
          <KeyValue
            items={[
              ['Webhook URL (set in Times)', <span className="break-all font-mono text-xs">{s.whatsapp.webhookUrl ?? '—'}</span>],
              [
                'Auto-reply',
                <span className="inline-flex items-start gap-1.5">
                  {e.autoReplyMode === 'all' || e.autoReplyMode === 'contacted' ? (
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-good" />
                  ) : e.autoReplyMode === 'off' ? (
                    <CircleDashed size={14} className="mt-0.5 shrink-0 text-ink-3" />
                  ) : (
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                  )}
                  {MODE_LABEL[e.autoReplyMode]}
                </span>,
              ],
              ['Message limit per customer', `${e.messageLimit} (message ${e.messageLimit} = download Desktop + helpline)`],
              ['Helpline', e.helpline],
              ['AI', s.llm.configured ? `NVIDIA ${s.llm.model}` : 'Not configured — replies use approved knowledge only'],
              ['Webhook secret', s.whatsapp.webhookConfigured ? 'Required (?key=…)' : 'Not set — accepting all calls'],
            ]}
          />
          <p className="text-xs text-ink-3">
            Change with <code>npx convex env set AUTO_REPLY_MODE contacted</code> (or <code>test_only</code> / <code>all</code> / <code>off</code>), <code>MESSAGE_LIMIT</code>, <code>HELPLINE_NUMBER</code>.
          </p>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Last webhook calls from Times</h3>
          {events === undefined ? null : events.length === 0 ? (
            <p className="text-sm text-ink-3">Nothing received yet. Reply to a test message from your phone to see it here.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {events.map((ev) => (
                <li key={ev._id} className="py-2">
                  <details>
                    <summary className="flex cursor-pointer items-center justify-between gap-3">
                      <span className="font-medium">
                        {ev.eventType === 'message' ? 'Customer message' : ev.eventType === 'status' ? 'Delivery status' : 'Unrecognised payload'}
                      </span>
                      <span className="shrink-0 text-xs text-ink-3">
                        {ev.status.toLowerCase()} · {fmtRelative(ev._creationTime)}
                      </span>
                    </summary>
                    {ev.error && <p className="mt-1 text-xs text-ink-2">{ev.error}</p>}
                    <pre className="scroll-thin mt-2 max-h-48 overflow-auto rounded-md bg-surface-2 p-2 text-[11px] leading-snug">{ev.payload}</pre>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}
