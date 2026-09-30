import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from 'convex/react';
import { AlertTriangle, ArrowLeft, Ban, Headset, History, MessagesSquare } from 'lucide-react';
import { STATE_META } from '../../shared/conversationStates.ts';
import { languageName } from '../../shared/languages.ts';
import { businessByKey } from '../../shared/knowledge/businessFeatures.ts';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { fmtDateTime, fmtPhone, fmtRelative } from '../lib/format.ts';
import { ChatThread } from '../components/ChatThread.tsx';
import { DeleteContactButton } from '../components/DeleteContactButton.tsx';
import { DesktopBadge, EligibilityBadge, StateBadge } from '../components/StateBadge.tsx';
import { Avatar, EmptyState, KeyValue, Loading, Section, buttonClass } from '../components/ui.tsx';

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  // Live subscription: new messages / state changes (e.g. from the webhook) appear instantly.
  const data = useQuery(api.customers.get, { id: id as Id<'customers'> });
  const [selected, setSelected] = useState(0);

  if (data === undefined) return <Loading />;
  if (data === null)
    return (
      <EmptyState title="Customer not found">
        <Link to="/customers" className={buttonClass('secondary', 'mt-3')}>
          Back to customers
        </Link>
      </EmptyState>
    );
  const { customer: c, conversations } = data;
  const conv = conversations[Math.min(selected, conversations.length - 1)];
  const lastActivity = conversations[0]?.lastMessageAt ?? c.lastActivityAt;
  const attrs = Object.entries(c.attributes);

  return (
    <>
      <Link to="/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> Customers
      </Link>

      <header className="mb-6 flex flex-wrap items-center gap-4">
        <Avatar name={c.name} className="h-12 w-12 text-sm" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{c.name ?? 'Unnamed customer'}</h1>
          <p className="font-mono text-sm text-ink-2">{fmtPhone(c.phone)}</p>
        </div>
        {conv && <StateBadge state={conv.state} size="lg" />}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="space-y-6">
          <Section title="Customer">
            <div className="px-5 py-4">
              <KeyValue
                items={[
                  ['Customer ID', c.externalId],
                  ['Campaign', conv?.campaignName ?? 'Not enrolled'],
                  ['Status', conv ? STATE_META[conv.state].label : 'Not contacted'],
                  ['Eligibility', <EligibilityBadge eligibility={c.eligibility} />],
                  ['Language', languageName(c.language)],
                  ['Desktop / laptop', <DesktopBadge value={c.hasDesktop} />],
                  ['Business (from chat)', businessByKey(conv?.businessCategory)?.label ?? 'Not known yet'],
                  ['Desktop status (from CSV)', c.desktopStatus ?? '—'],
                  ['Last activity', `${fmtRelative(lastActivity)}`],
                  ['City', c.city],
                  ['Business type', c.businessType],
                  ['Plan', c.plan],
                  ['Mobile usage', c.mobileUsage],
                  ['Assigned agent', c.assignedAgent ?? 'None'],
                  ...(c.optedOutAt ? ([['Opted out', fmtDateTime(c.optedOutAt)]] as Array<[string, string]>) : []),
                  ...(c.isDemo ? ([['Data', 'Demo record']] as Array<[string, string]>) : []),
                ]}
              />
            </div>
          </Section>

          <DeleteContactButton id={c._id} />

          {attrs.length > 0 && (
            <Section title="Custom attributes" description="Extra columns from the CSV">
              <div className="px-5 py-4">
                <KeyValue items={attrs.map(([k, v]) => [k.replace(/_/g, ' '), v])} />
              </div>
            </Section>
          )}

          {conv && conv.events.length > 0 && (
            <Section title="Status history">
              <ol className="space-y-3 px-5 py-4">
                {conv.events.map((e) => (
                  <li key={e._id} className="flex gap-3 text-sm">
                    <History size={14} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                    <div>
                      <p>
                        {e.fromState ? `${STATE_META[e.fromState].label} → ` : ''}
                        <span className="font-medium">{STATE_META[e.toState].label}</span>
                      </p>
                      <p className="text-xs text-ink-3">
                        {fmtDateTime(e.at)} · {e.actor}
                        {e.reason ? ` · ${e.reason}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {!conv ? (
            <Section>
              <EmptyState icon={<MessagesSquare size={20} />} title="No conversation yet">
                {c.eligibility !== 'ELIGIBLE' ? 'This customer is excluded from campaigns.' : 'This customer has not been messaged by any campaign.'}
              </EmptyState>
            </Section>
          ) : (
            <>
              {conv.state === 'NEEDS_HUMAN' && (
                <div role="alert" className="rounded-xl border border-critical/40 bg-critical/5 px-5 py-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <AlertTriangle size={20} className="mt-0.5 shrink-0 text-critical" aria-hidden />
                    <div className="min-w-0 flex-1 space-y-1 text-sm">
                      <p className="font-semibold">Needs a human</p>
                      <p>
                        <span className="text-ink-2">Reason:</span> {conv.needsHumanReason ?? 'Not specified'}
                      </p>
                      {conv.summary && (
                        <p>
                          <span className="text-ink-2">Summary:</span> {conv.summary}
                        </p>
                      )}
                    </div>
                    <button
                      className={buttonClass('primary')}
                      disabled
                      title="Human takeover (reply as agent, hand back to AI) is built in phase 8"
                    >
                      <Headset size={16} /> Take over
                    </button>
                  </div>
                </div>
              )}
              {conv.state === 'STOPPED' && (
                <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-5 py-3 text-sm">
                  <Ban size={18} className="text-warning" aria-hidden />
                  Customer opted out. No further messages will be sent.
                </div>
              )}

              <Section
                title={conv.campaignName}
                description={`Started ${fmtDateTime(conv._creationTime)}${conv.aiPaused ? ' · AI paused (human handling)' : ''}`}
                actions={
                  conversations.length > 1 ? (
                    <select
                      aria-label="Conversation"
                      value={selected}
                      onChange={(e) => setSelected(Number(e.target.value))}
                      className="rounded-lg border border-line bg-surface px-2 py-1 text-sm"
                    >
                      {conversations.map((x, i) => (
                        <option key={x._id} value={i}>
                          {x.campaignName}
                        </option>
                      ))}
                    </select>
                  ) : undefined
                }
                className="overflow-hidden"
              >
                {conv.messages.length ? (
                  <ChatThread messages={conv.messages} />
                ) : (
                  <EmptyState title="No messages yet" />
                )}
                <p className="border-t border-line px-5 py-2.5 text-xs text-ink-3">
                  AI metadata shows structured intent, sentiment, stage and next action only. Model reasoning is never stored or shown.
                </p>
              </Section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
