import { AlertTriangle, Ban, CheckCircle2, Circle, HelpCircle, MessageCircle, Monitor, MonitorOff, TrendingUp, UserX } from 'lucide-react';
import { STATE_META, type ConversationState, type StateTone } from '../../shared/conversationStates.ts';
import { EXCLUSION_LABEL, type ExclusionReason } from '../../shared/types.ts';

// Status colour always travels with an icon + text label — never colour alone.
const TONE: Record<StateTone, { icon: typeof Circle; className: string }> = {
  neutral: { icon: Circle, className: 'text-ink-3' },
  info: { icon: MessageCircle, className: 'text-series-1' },
  progress: { icon: TrendingUp, className: 'text-series-1' },
  good: { icon: CheckCircle2, className: 'text-good' },
  warning: { icon: Ban, className: 'text-warning' },
  critical: { icon: AlertTriangle, className: 'text-critical' },
};

export function StateBadge({ state, size = 'sm' }: { state: ConversationState | null | undefined; size?: 'sm' | 'lg' }) {
  if (!state) return <span className="text-sm text-ink-3">Not contacted</span>;
  const meta = STATE_META[state];
  const tone = TONE[meta.tone];
  const Icon = tone.icon;
  const strong = meta.tone === 'critical';
  return (
    <span
      title={meta.description}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium ${
        size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'
      } ${strong ? 'border-critical/40 bg-critical/10 text-ink' : 'border-line bg-surface text-ink'}`}
    >
      <Icon size={size === 'lg' ? 15 : 13} className={tone.className} aria-hidden />
      {meta.label}
    </span>
  );
}

export function EligibilityBadge({ eligibility }: { eligibility: 'ELIGIBLE' | ExclusionReason }) {
  const reason = eligibility === 'ELIGIBLE' ? null : eligibility;
  if (!reason)
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium">
        <CheckCircle2 size={13} className="text-good" aria-hidden /> Eligible
      </span>
    );
  const Icon = reason === 'OPTED_OUT' ? Ban : UserX;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-ink-2">
      <Icon size={13} className={reason === 'OPTED_OUT' ? 'text-warning' : 'text-ink-3'} aria-hidden />
      {EXCLUSION_LABEL[reason]}
    </span>
  );
}

/** Customer flag from the chat: has a desktop/laptop, doesn't, or not confirmed yet. */
export function DesktopBadge({ value }: { value?: 'YES' | 'NO' }) {
  if (value === 'YES')
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium">
        <Monitor size={13} className="text-good" aria-hidden /> Has desktop
      </span>
    );
  if (value === 'NO')
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-ink-2">
        <MonitorOff size={13} className="text-ink-3" aria-hidden /> No desktop
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-3">
      <HelpCircle size={13} aria-hidden /> Unconfirmed
    </span>
  );
}
