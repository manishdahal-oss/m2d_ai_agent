import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Loader2, Trash2 } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { fmtNumber } from '../lib/format.ts';
import { Section, buttonClass } from './ui.tsx';

/** Delete a campaign that never reached anyone (e.g. wrong numbers uploaded), optionally with its contacts. */
export function DeleteCampaignPanel({ campaignId, name }: { campaignId: Id<'campaigns'>; name: string }) {
  const preview = useQuery(api.cleanup.campaignDeletePreview, { campaignId });
  const remove = useMutation(api.cleanup.deleteCampaign);
  const navigate = useNavigate();
  const [withContacts, setWithContacts] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!preview) return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await remove({ campaignId, deleteContacts: withContacts, confirm: true });
      navigate('/campaigns');
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Section title="Delete campaign" description="For a campaign that never reached anyone — e.g. the wrong numbers were uploaded.">
      <div className="space-y-3 px-5 py-4 text-sm">
        {preview.blocked ? (
          <p className="text-ink-2">{preview.blocked}</p>
        ) : (
          <>
            <p className="text-ink-2">
              {fmtNumber(preview.contacts)} contacts are in this campaign; none of them received a message. Deleting removes the campaign and its failed/pending sends.
            </p>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" checked={withContacts} onChange={(e) => setWithContacts(e.target.checked)} />
              <span>
                Also delete these contacts (
                {preview.deletableContacts === null
                  ? 'contacts who opted out or are in another campaign are kept'
                  : `${fmtNumber(preview.deletableContacts)} can be deleted${preview.contacts > preview.deletableContacts ? ` — ${fmtNumber(preview.contacts - preview.deletableContacts)} are kept: opted out, or in another campaign` : ''}`}
                )
              </span>
            </label>
            <label className="flex items-start gap-2 text-ink-2">
              <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              I understand this permanently deletes “{name}”{withContacts ? ' and its contacts' : ''}.
            </label>
            <button className={buttonClass('secondary', 'border-critical/50 text-critical hover:bg-critical/5')} disabled={!confirmed || busy} onClick={() => void run()}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Delete campaign{withContacts ? ' and contacts' : ''}
            </button>
          </>
        )}
        {error && <p className="text-critical">{error}</p>}
      </div>
    </Section>
  );
}
