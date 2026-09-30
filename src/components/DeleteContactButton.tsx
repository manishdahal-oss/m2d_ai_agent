import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation } from 'convex/react';
import { Loader2, Trash2 } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { buttonClass } from './ui.tsx';

/** Delete one contact (e.g. a wrong number). Opted-out / already-messaged contacts are kept by the server. */
export function DeleteContactButton({ id }: { id: Id<'customers'> }) {
  const remove = useMutation(api.cleanup.deleteCustomers);
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    const r = await remove({ ids: [id] });
    if (r.deleted) navigate('/customers');
    else {
      setMessage(`Can't delete: ${r.kept[0]?.reason ?? 'unknown reason'}.`);
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <div className="space-y-2 text-sm">
      {!confirm ? (
        <button className={buttonClass('ghost', 'text-critical hover:bg-critical/5')} onClick={() => setConfirm(true)}>
          <Trash2 size={15} /> Delete contact
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink-2">Delete this contact permanently?</span>
          <button className={buttonClass('primary', 'bg-critical py-1.5 text-white')} disabled={busy} onClick={() => void run()}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Delete
          </button>
          <button className={buttonClass('ghost', 'py-1.5')} onClick={() => setConfirm(false)}>
            Cancel
          </button>
        </div>
      )}
      {message && <p className="text-ink-2">{message}</p>}
    </div>
  );
}
