import { useState, type FormEvent } from 'react';
import { useAction } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Bot, Eye, Loader2, RotateCcw } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { Section, buttonClass } from './ui.tsx';
import { DEFAULT_TEMPLATE, fillTemplate } from '../../shared/templates.ts';

type Turn = { role: 'assistant' | 'user'; text: string; meta?: string };

const OPENING = fillTemplate(DEFAULT_TEMPLATE.text, DEFAULT_TEMPLATE.params);

/** Chat with the agent as if you were a customer. Nothing is sent on WhatsApp; nothing is saved. */
export function PreviewPanel() {
  const preview = useAction(api.engine.previewReply);
  const [turns, setTurns] = useState<Turn[]>([{ role: 'assistant', text: OPENING, meta: 'template' }]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sentSoFar = turns.filter((t) => t.role === 'assistant').length;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    const history = turns.map(({ role, text }) => ({ role, text }));
    setTurns((t) => [...t, { role: 'user', text }]);
    setDraft('');
    try {
      const r = await preview({ text, history, alreadySent: sentSoFar });
      const label =
        r.source === 'ai' ? `AI · ${r.model}` : r.source === 'sop' ? 'SOP step (exact wording)' : r.source === 'fallback' ? `SOP without AI${r.error ? ` (${r.error.slice(0, 60)})` : ''}` : r.rule;
      const meta =
        r.source === 'rule' || r.source === 'none'
          ? r.rule
          : [label, r.businessCategory && `business: ${r.businessCategory}`, r.intent && `intent: ${r.intent}`, r.stage && `stage: ${r.stage}`, r.latencyMs && `${(r.latencyMs / 1000).toFixed(1)}s`]
              .filter(Boolean)
              .join(' · ');
      setTurns((t) => [...t, { role: 'assistant', text: r.reply, meta }]);
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Preview the agent"
      description="Chat as a customer to see exactly what the agent would reply. Nothing is sent on WhatsApp and nothing is saved."
      actions={
        <button className={buttonClass('ghost')} onClick={() => (setTurns([{ role: 'assistant', text: OPENING, meta: 'template' }]), setError(null))}>
          <RotateCcw size={15} /> Reset
        </button>
      }
    >
      <ol className="wa-pattern max-h-[28rem] space-y-2 overflow-y-auto px-4 py-4 scroll-thin" aria-label="Preview conversation">
        {turns.map((t, i) => (
          <li key={i} className={`flex ${t.role === 'user' ? 'justify-start' : 'justify-end'}`}>
            <div className="max-w-[85%]">
              <p className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-sm shadow-sm ${t.role === 'user' ? 'rounded-tl-none bg-wa-in' : 'rounded-tr-none bg-wa-out'}`}>{t.text}</p>
              {t.meta && <p className={`mt-0.5 text-[11px] text-ink-3 ${t.role === 'user' ? '' : 'text-right'}`}>{t.meta}</p>}
            </div>
          </li>
        ))}
        {busy && (
          <li className="flex justify-end text-xs text-ink-3">
            <Loader2 size={14} className="mr-1 animate-spin" /> agent is replying…
          </li>
        )}
      </ol>
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-line px-4 py-3">
        <Bot size={16} className="shrink-0 text-ink-3" aria-hidden />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder='Type like a customer, e.g. "haan batao" or "free hai kya?"'
          aria-label="Customer message to preview"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <button type="submit" className={buttonClass('primary')} disabled={busy || !draft.trim()}>
          <Eye size={16} /> Preview reply
        </button>
      </form>
      {error && <p className="px-4 pb-3 text-sm text-critical">{error}</p>}
      <p className="border-t border-line px-4 py-2 text-xs text-ink-3">
        Messages the agent has "sent" in this preview: {sentSoFar} — the limit rules apply here too.
      </p>
    </Section>
  );
}
