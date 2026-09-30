import { Link } from 'react-router';
import { useQuery } from 'convex/react';
import { AlertTriangle, ArrowRight, Upload } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { useAnalytics } from '../lib/convex.ts';
import { fmtNumber, fmtPct, fmtRelative, fmtPhone, ratio } from '../lib/format.ts';
import { Funnel } from '../components/Funnel.tsx';
import { StatTile } from '../components/StatTile.tsx';
import { Avatar, EmptyState, ErrorState, Loading, PageHeader, Section, buttonClass } from '../components/ui.tsx';

export function OverviewPage() {
  const analytics = useAnalytics({});
  const needsHuman = useQuery(api.conversations.needsHumanPreview, { limit: 5 });
  const imports = useQuery(api.customers.listImports, { limit: 3 });

  if (analytics.isPending) return <Loading />;
  if (analytics.isError) return <ErrorState error={analytics.error} />;
  const m = analytics.data.metrics;

  if (m.customersUploaded === 0) {
    return (
      <>
        <PageHeader title="Overview" description="Mobile → Desktop conversion over WhatsApp" />
        <Section>
          <EmptyState icon={<Upload size={20} />} title="No customers yet">
            Upload a customer CSV to see who is eligible for the Desktop campaign.
            <div className="mt-4">
              <Link to="/customers/import" className={buttonClass('primary')}>
                <Upload size={16} /> Upload customers
              </Link>
            </div>
          </EmptyState>
        </Section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Overview"
        description="Mobile → Desktop conversion over WhatsApp"
        actions={
          <Link to="/customers/import" className={buttonClass('secondary')}>
            <Upload size={16} /> Upload customers
          </Link>
        }
      />

      {m.needsHuman > 0 && (
        <Link
          to="/needs-human"
          className="mb-6 flex items-center gap-3 rounded-xl border border-critical/40 bg-critical/5 px-4 py-3 text-sm transition hover:bg-critical/10"
        >
          <AlertTriangle size={18} className="shrink-0 text-critical" aria-hidden />
          <span className="flex-1">
            <span className="font-semibold">{m.needsHuman} {m.needsHuman === 1 ? 'conversation needs' : 'conversations need'} a human.</span>{' '}
            <span className="text-ink-2">Customers are waiting for help.</span>
          </span>
          <ArrowRight size={16} className="text-ink-2" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Customers uploaded" value={m.customersUploaded} to="/customers" />
        <StatTile label="Eligible customers" value={m.eligibleCustomers} hint={`${fmtPct(ratio(m.eligibleCustomers, m.customersUploaded), 0)} of uploaded`} to="/customers?eligibility=ELIGIBLE" />
        <StatTile label="Messages sent" value={m.messagesSent} />
        <StatTile label="Delivered" value={m.delivered} hint={`${fmtPct(ratio(m.delivered, m.messagesSent), 0)} of sent`} />
        <StatTile label="Customer replies" value={m.customerReplies} />
        <StatTile label="Active conversations" value={m.activeConversations} to="/conversations" />
        <StatTile label="Interested" value={m.interested} to="/conversations?state=INTERESTED" />
        <StatTile label="Desktop links sent" value={m.linksSent} />
        <StatTile label="Desktop links clicked" value={m.linksClicked} hint={`${fmtPct(ratio(m.linksClicked, m.linksSent), 0)} of links sent`} />
        <StatTile label="Desktop activated" value={m.activated} to="/conversations?state=DESKTOP_ACTIVATED" />
        <StatTile
          label="Needs human"
          value={m.needsHuman}
          to="/needs-human"
          emphasis={m.needsHuman > 0 ? <AlertTriangle size={14} className="text-critical" aria-label="Attention" /> : undefined}
        />
        <StatTile label="Not interested" value={m.notInterested} hint={`${fmtNumber(m.optedOut)} opted out`} to="/conversations?state=NOT_INTERESTED" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Section
          title="Conversion funnel"
          description="Distinct customers reaching each milestone, all campaigns"
          actions={
            <Link to="/analytics" className="text-xs font-medium text-brand hover:underline">
              Analytics →
            </Link>
          }
        >
          <div className="px-4 pb-4 pt-3 sm:px-5">
            <Funnel stages={analytics.data.funnel} />
            <p className="mt-4 text-sm text-ink-2">
              Conversion rate (activations ÷ eligible):{' '}
              <span className="font-semibold text-ink tabular">{fmtPct(analytics.data.conversionRate)}</span>
            </p>
          </div>
        </Section>

        <div className="space-y-6">
          <Section
            title="Waiting for a human"
            actions={
              <Link to="/needs-human" className="text-xs font-medium text-brand hover:underline">
                View all →
              </Link>
            }
          >
            {needsHuman === undefined ? (
              <Loading />
            ) : needsHuman.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-3">No one is waiting.</p>
            ) : (
              <ul className="divide-y divide-line">
                {needsHuman.map((c) => (
                  <li key={c._id}>
                    <Link to={`/customers/${c.customerId}`} className="flex items-start gap-3 px-5 py-3 hover:bg-surface-2">
                      <Avatar name={c.customerName} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center justify-between gap-2 text-sm font-medium">
                          <span className="truncate">{c.customerName ?? fmtPhone(c.customerPhone)}</span>
                          <span className="shrink-0 text-xs font-normal text-ink-3">{fmtRelative(c.needsHumanAt)}</span>
                        </p>
                        <p className="truncate text-xs text-ink-2">{c.needsHumanReason ?? 'Needs attention'}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Recent uploads"
            actions={
              <Link to="/customers/import" className="text-xs font-medium text-brand hover:underline">
                Upload →
              </Link>
            }
          >
            {imports === undefined ? (
              <Loading />
            ) : imports.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-3">No CSV uploads yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {imports.map((b) => (
                  <li key={b._id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{b.filename}</p>
                      <p className="text-xs text-ink-3">{b.status === 'IN_PROGRESS' ? 'In progress…' : fmtRelative(b._creationTime)}</p>
                    </div>
                    <p className="shrink-0 text-right text-xs text-ink-2 tabular">
                      {fmtNumber(b.stats?.eligible)} eligible
                      <br />
                      {fmtNumber(b.stats?.totalRows)} rows
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
