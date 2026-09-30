import { Link, useParams } from 'react-router';
import { useQuery } from 'convex/react';
import { ArrowLeft, CircleDot, Megaphone, Pause, Play, Plus } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { languageName } from '../../shared/languages.ts';
import type { CampaignStats, CampaignStatus } from '../../shared/types.ts';
import { useAnalytics } from '../lib/convex.ts';
import { fmtDate, fmtNumber, fmtPct, ratio } from '../lib/format.ts';
import { EmptyState, KeyValue, Loading, PageHeader, Section, buttonClass } from '../components/ui.tsx';
import { CampaignControls } from '../components/CampaignControls.tsx';
import { DeleteCampaignPanel } from '../components/DeleteCampaignPanel.tsx';

const STATUS_ICON: Record<CampaignStatus, { icon: typeof Play; className: string; label: string }> = {
  DRAFT: { icon: CircleDot, className: 'text-ink-3', label: 'Draft' },
  READY: { icon: CircleDot, className: 'text-series-1', label: 'Ready' },
  RUNNING: { icon: Play, className: 'text-good', label: 'Running' },
  PAUSED: { icon: Pause, className: 'text-warning', label: 'Paused' },
  COMPLETED: { icon: CircleDot, className: 'text-ink-2', label: 'Completed' },
};

const EMPTY_STATS: CampaignStats = { enrolled: 0, contacted: 0, replied: 0, interested: 0, linkSent: 0, activated: 0, needsHuman: 0 };

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const s = STATUS_ICON[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-medium">
      <s.icon size={12} className={s.className} aria-hidden /> {s.label}
    </span>
  );
}

function StatsRow({ stats, loading }: { stats: CampaignStats; loading?: boolean }) {
  const items: Array<[string, number, string?]> = [
    ['Enrolled', stats.enrolled],
    ['Contacted', stats.contacted],
    ['Replied', stats.replied, fmtPct(ratio(stats.replied, stats.contacted), 0)],
    ['Interested', stats.interested],
    ['Link sent', stats.linkSent],
    ['Activated', stats.activated, fmtPct(ratio(stats.activated, stats.contacted), 1)],
    ['Needs human', stats.needsHuman],
  ];
  return (
    <dl className={`grid grid-cols-3 gap-px bg-line sm:grid-cols-4 lg:grid-cols-7 ${loading ? 'opacity-60' : ''}`}>
      {items.map(([label, v, hint]) => (
        <div key={label} className="bg-surface px-4 py-3">
          <dt className="text-xs text-ink-2">{label}</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular">{loading ? '…' : fmtNumber(v)}</dd>
          {hint && !loading && <p className="text-[11px] text-ink-3">{hint}</p>}
        </div>
      ))}
    </dl>
  );
}

export function CampaignsPage() {
  const campaigns = useQuery(api.campaigns.list);
  const analytics = useAnalytics({});
  const stats = (id: string) => analytics.data?.campaignStats[id] ?? EMPTY_STATS;

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Send the first WhatsApp template to uploaded contacts. Replies are answered by the AI automatically."
        actions={
          <Link to="/campaigns/new" className={buttonClass('primary')}>
            <Plus size={16} /> New campaign
          </Link>
        }
      />
      {campaigns === undefined ? (
        <Loading />
      ) : campaigns.length === 0 ? (
        <Section>
          <EmptyState icon={<Megaphone size={20} />} title="No campaigns yet">
            Upload contacts, then create a campaign to send them the first WhatsApp message.
            <div className="mt-4">
              <Link to="/campaigns/new" className={buttonClass('primary')}>
                <Plus size={16} /> New campaign
              </Link>
            </div>
          </EmptyState>
        </Section>
      ) : (
        <div className="space-y-4">
          {campaigns.map((c) => (
            <Link key={c._id} to={`/campaigns/${c._id}`} className="block overflow-hidden rounded-xl border border-line bg-surface transition hover:border-brand/50">
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-semibold">{c.name}</p>
                  {c.description && <p className="mt-0.5 text-sm text-ink-2">{c.description}</p>}
                </div>
                <CampaignStatusBadge status={c.status} />
              </div>
              <div className="border-t border-line">
                <StatsRow stats={stats(c._id)} loading={analytics.isPending} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export function CampaignDetailPage() {
  const { id = '' } = useParams();
  const c = useQuery(api.campaigns.get, { id: id as Id<'campaigns'> });
  const analytics = useAnalytics({});
  if (c === undefined) return <Loading />;
  if (c === null)
    return (
      <EmptyState title="Campaign not found">
        <Link to="/campaigns" className={buttonClass('secondary', 'mt-3')}>
          Back to campaigns
        </Link>
      </EmptyState>
    );
  return (
    <>
      <Link to="/campaigns" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> Campaigns
      </Link>
      <PageHeader title={c.name} description={c.description} actions={<CampaignStatusBadge status={c.status} />} />
      <div className="space-y-6">
        {!c.isSystem && !c.isDemo && c.providerTemplateName && <CampaignControls c={c} />}
        <Section className="overflow-hidden">
          <StatsRow stats={analytics.data?.campaignStats[c._id] ?? EMPTY_STATS} loading={analytics.isPending} />
        </Section>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section title="Initial WhatsApp message" description={c.providerTemplateName ? `Provider template: ${c.providerTemplateName}` : 'Provider template not linked yet'}>
            <div className="wa-pattern px-5 py-5">
              <p className="ml-auto max-w-md whitespace-pre-wrap rounded-lg rounded-tr-none bg-wa-out px-3 py-2 text-sm shadow-sm">{c.messageTemplate ?? '—'}</p>
            </div>
          </Section>
          <Section title="Configuration">
            <div className="px-5 py-4">
              <KeyValue
                items={[
                  ['Status', <CampaignStatusBadge status={c.status} />],
                  ['Template language', languageName(c.templateLanguage)],
                  ['Desktop link', c.desktopDownloadUrl ? <span className="break-all font-mono text-xs">{c.desktopDownloadUrl}</span> : 'Not set'],
                  ['Target segment', <code className="text-xs">{JSON.stringify(c.segment)}</code>],
                  ['Send rate', `${c.sendRatePerMinute} / minute`],
                  ['Started', fmtDate(c.startedAt)],
                  ['Created', fmtDate(c._creationTime)],
                ]}
              />
            </div>
          </Section>
        </div>
        <Section title="AI instructions">
          <p className="whitespace-pre-wrap px-5 py-4 text-sm text-ink-2">{c.aiInstructions ?? 'Not set'}</p>
        </Section>
        {!c.isSystem && !c.isDemo && <DeleteCampaignPanel campaignId={c._id} name={c.name} />}
        <p className="text-sm">
          <Link to={`/conversations?campaignId=${c._id}`} className="font-medium text-brand hover:underline">
            View this campaign's conversations →
          </Link>
        </p>
      </div>
    </>
  );
}
