import { useState, type FormEvent } from 'react';
import { useAction, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { AlertTriangle, CheckCircle2, Loader2, Send } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { fmtPhone, fmtRelative } from '../lib/format.ts';
import { Section, buttonClass } from './ui.tsx';
import { TemplateVariables, paramsFor } from './TemplateVariables.tsx';
import { DEFAULT_TEMPLATE } from '../../shared/templates.ts';


const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-ink-3 focus:border-brand focus:ring-2 focus:ring-brand/20';

/** Send one approved template to a number you own, to verify the Times integration end to end. */
export function TestSendPanel() {
  const send = useAction(api.whatsapp.testSend.send);
  const recent = useQuery(api.whatsapp.testSend.recent);
  const [to, setTo] = useState('');
  const [templateName, setTemplateName] = useState(DEFAULT_TEMPLATE.name);
  const [languageCode, setLanguageCode] = useState(DEFAULT_TEMPLATE.language);
  const [params, setParams] = useState<string[]>(DEFAULT_TEMPLATE.params);
  const [templateText, setTemplateText] = useState(DEFAULT_TEMPLATE.text);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const bodyParams = paramsFor(templateText, params);
      const r = await send({ to, templateName, languageCode, bodyParams, templateText });
      setResult(
        r.ok
          ? { ok: true, text: `Accepted by Times${r.providerMessageId ? ` (id ${r.providerMessageId})` : ''}. Check the phone.` }
          : { ok: false, text: `Times rejected it${r.httpStatus ? ` (HTTP ${r.httpStatus})` : ''}: ${r.error}` },
      );
      if (r.ok) setConfirmed(false);
    } catch (err) {
      setResult({ ok: false, text: err instanceof ConvexError ? String(err.data) : err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Send a test WhatsApp message"
      description="Sends one approved template to a number you own and starts a test conversation — reply from that phone to see the agent answer. Max 5 per 10 minutes; every attempt is logged."
    >
      <div className="grid grid-cols-1 gap-6 px-5 py-4 lg:grid-cols-2">
        <form onSubmit={submit} className="space-y-3 text-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-medium">Your WhatsApp number</span>
              <input className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} placeholder="+91 98765 43210" inputMode="tel" />
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">Language code</span>
              <input className={inputCls} value={languageCode} onChange={(e) => setLanguageCode(e.target.value)} placeholder="en" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block font-medium">Approved template name</span>
            <input className={`${inputCls} font-mono`} value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. support_m2d" />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">
              Template text <span className="font-normal text-ink-3">(what the customer sees — gives the AI context for their reply)</span>
            </span>
            <textarea className={inputCls} rows={3} value={templateText} onChange={(e) => setTemplateText(e.target.value)} />
          </label>
          <TemplateVariables templateText={templateText} params={params} onChange={setParams} hint="blank is allowed" />
          <label className="flex items-start gap-2 text-ink-2">
            <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            This number is mine (or a colleague's who agreed). This sends a real WhatsApp message.
          </label>
          <button type="submit" className={buttonClass('primary')} disabled={busy || !confirmed || !to.trim() || !templateName.trim()}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send test message
          </button>
          {result && (
            <p role="status" className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${result.ok ? 'border-good/40 bg-good/5' : 'border-critical/30 bg-critical/5'}`}>
              {result.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-good" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-critical" />}
              <span className="min-w-0 break-words">{result.text}</span>
            </p>
          )}
        </form>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Your recent test sends</h3>
          {!recent?.length ? (
            <p className="text-sm text-ink-3">None yet.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {recent.map((r) => (
                <li key={r._id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs">{r.templateName}</p>
                    <p className="text-xs text-ink-3">
                      {fmtPhone(r.to)} · {fmtRelative(r._creationTime)}
                    </p>
                    {r.error && <p className="break-words text-xs text-critical">{r.error}</p>}
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium">
                    {r.status === 'SENT' ? <CheckCircle2 size={13} className="text-good" /> : r.status === 'FAILED' ? <AlertTriangle size={13} className="text-critical" /> : <Loader2 size={13} className="animate-spin" />}
                    {r.status === 'SENT' ? 'Accepted' : r.status === 'FAILED' ? 'Failed' : 'Sending'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}
