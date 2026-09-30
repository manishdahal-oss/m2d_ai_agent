import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { Bot, Headset, Info, MessagesSquare, User } from 'lucide-react';
import { CONVERSATION_STATES, STATE_META, isConversationState } from '../../shared/conversationStates.ts';
import { languageName } from '../../shared/languages.ts';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { ConversationListItem } from '../lib/convex.ts';
import { fmtPhone, fmtRelative } from '../lib/format.ts';
import { StateBadge } from '../components/StateBadge.tsx';
import { Avatar, EmptyState, LoadMore, Loading, PageHeader, SearchInput, Section, Select } from '../components/ui.tsx';
import { useDebounced } from './CustomersPage.tsx';

const SENDER_ICON = { CUSTOMER: User, AI: Bot, HUMAN: Headset, SYSTEM: Info } as const;

export function ConversationRow({ c, showReason = false }: { c: ConversationListItem; showReason?: boolean }) {
  const Icon = c.lastMessageSender ? SENDER_ICON[c.lastMessageSender] : null;
  return (
    <li>
      <Link to={`/customers/${c.customerId}`} className="flex items-start gap-3 px-4 py-3.5 hover:bg-surface-2 sm:px-5">
        <Avatar name={c.customerName} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">{c.customerName ?? fmtPhone(c.customerPhone)}</span>
            <span className="font-mono text-xs text-ink-3">{fmtPhone(c.customerPhone)}</span>
            <span className="text-xs text-ink-3">{languageName(c.customerLanguage)}</span>
          </div>
          {showReason ? (
            <div className="mt-1 space-y-0.5 text-sm">
              <p>
                <span className="text-ink-3">Reason:</span> {c.needsHumanReason ?? 'Not specified'}
              </p>
              {c.summary && (
                <p className="text-ink-2">
                  <span className="text-ink-3">Summary:</span> {c.summary}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-ink-2">
              {Icon && <Icon size={13} className="shrink-0 text-ink-3" aria-hidden />}
              <span className="truncate">{c.lastMessagePreview ?? 'No messages yet'}</span>
            </p>
          )}
          <p className="mt-1 text-xs text-ink-3">{c.campaignName}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StateBadge state={c.state} />
          <span className="text-xs text-ink-3">{fmtRelative(showReason ? c.needsHumanAt : c.lastMessageAt)}</span>
        </div>
      </Link>
    </li>
  );
}

export function ConversationsPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q);
  const rawState = params.get('state') ?? '';
  const state = isConversationState(rawState) ? rawState : undefined;
  const campaigns = useQuery(api.campaigns.list);
  const rawCampaign = params.get('campaignId') ?? '';
  // Only pass ids we know exist, so a stale/garbled URL can't fail validation.
  const campaignId = campaigns?.some((c) => c._id === rawCampaign) ? (rawCampaign as Id<'campaigns'>) : undefined;

  const { results, status, loadMore } = usePaginatedQuery(
    api.conversations.list,
    campaigns === undefined && rawCampaign ? 'skip' : { state, campaignId, q: debouncedQ || undefined },
    { initialNumItems: 25 },
  );

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader title="Conversations" description="Every WhatsApp conversation across campaigns" />
      <Section>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <SearchInput value={q} onChange={setQ} placeholder="Search name or phone" />
          <Select label="Status" value={state ?? ''} onChange={(e) => set('state', e.target.value)}>
            <option value="">All statuses</option>
            {CONVERSATION_STATES.map((s) => (
              <option key={s} value={s}>
                {STATE_META[s].label}
              </option>
            ))}
          </Select>
          <Select label="Campaign" value={campaignId ?? ''} onChange={(e) => set('campaignId', e.target.value)}>
            <option value="">All campaigns</option>
            {campaigns?.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        {status === 'LoadingFirstPage' ? (
          <Loading />
        ) : results.length === 0 ? (
          <EmptyState icon={<MessagesSquare size={20} />} title="No conversations">
            {state || campaignId || debouncedQ ? 'Nothing matches these filters.' : 'Conversations appear here once a campaign starts messaging customers.'}
          </EmptyState>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {results.map((c) => (
                <ConversationRow key={c._id} c={c} />
              ))}
            </ul>
            <LoadMore status={status} shown={results.length} onLoadMore={() => loadMore(50)} noun="conversations" />
          </>
        )}
      </Section>
    </>
  );
}
