import { usePaginatedQuery, useQuery } from 'convex/react';
import { CheckCircle2, Headset } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { EmptyState, LoadMore, Loading, PageHeader, Section } from '../components/ui.tsx';
import { ConversationRow } from './ConversationsPage.tsx';

export function NeedsHumanPage() {
  // Live queue: escalations appear the moment they happen.
  const { results, status, loadMore } = usePaginatedQuery(api.conversations.list, { state: 'NEEDS_HUMAN' }, { initialNumItems: 25 });
  const count = useQuery(api.conversations.needsHumanCount);

  return (
    <>
      <PageHeader
        title="Needs Human"
        description={
          <>
            Customers who asked for a person, or whom the AI couldn't confidently help. The AI stops replying until someone takes over. Oldest first.
          </>
        }
      />
      <Section>
        {status === 'LoadingFirstPage' ? (
          <Loading />
        ) : results.length === 0 ? (
          <EmptyState icon={<CheckCircle2 size={20} className="text-good" />} title="No one is waiting">
            Escalated conversations will appear here.
          </EmptyState>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-line px-5 py-3 text-sm">
              <Headset size={16} className="text-critical" aria-hidden />
              <span className="font-medium tabular">
                {count?.count ?? results.length}
                {count?.capped ? '+' : ''}
              </span>{' '}
              waiting
              <span className="ml-auto text-xs text-ink-3">Take-over controls arrive in phase 8</span>
            </div>
            <ul className="divide-y divide-line">
              {results.map((c) => (
                <ConversationRow key={c._id} c={c} showReason />
              ))}
            </ul>
            <LoadMore status={status} shown={results.length} onLoadMore={() => loadMore(50)} noun="conversations" />
          </>
        )}
      </Section>
    </>
  );
}
