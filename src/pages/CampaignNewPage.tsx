import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { ArrowLeft, Users } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { fmtNumber } from '../lib/format.ts';
import { ErrorState, PageHeader, Section, buttonClass } from '../components/ui.tsx';
import { TemplateVariables, paramsFor } from '../components/TemplateVariables.tsx';
import { DEFAULT_TEMPLATE } from '../../shared/templates.ts';


const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-ink-3 focus:border-brand focus:ring-2 focus:ring-brand/20';

export function CampaignNewPage() {
  const navigate = useNavigate();
  const audience = useQuery(api.campaignRun.audience);
  const create = useMutation(api.campaignRun.create);
  const [name, setName] = useState(`M2D ${new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`);
  const [templateName, setTemplateName] = useState(DEFAULT_TEMPLATE.name);
  const [templateLanguage, setTemplateLanguage] = useState(DEFAULT_TEMPLATE.language);
  const [templateText, setTemplateText] = useState(DEFAULT_TEMPLATE.text);
  const [params, setParams] = useState<string[]>(DEFAULT_TEMPLATE.params);
  const [rate, setRate] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = await create({
        name,
        templateName,
        templateLanguage,
        templateText,
        templateParams: paramsFor(templateText, params),
        sendRatePerMinute: rate,
      });
      navigate(`/campaigns/${id}`);
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <>
      <Link to="/campaigns" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> Campaigns
      </Link>
      <PageHeader title="New campaign" description="Sends the approved WhatsApp template to every eligible contact who hasn't been messaged yet. Nothing is sent until you press Start." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Section>
          <form onSubmit={submit} className="space-y-4 px-5 py-5 text-sm">
            <label className="block">
              <span className="mb-1 block font-medium">Campaign name</span>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <label className="block">
                <span className="mb-1 block font-medium">Approved template name</span>
                <input className={`${inputCls} font-mono`} value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="exactly as approved in Times" required />
              </label>
              <label className="block">
                <span className="mb-1 block font-medium">Template language</span>
                <select className={inputCls} value={templateLanguage} onChange={(e) => setTemplateLanguage(e.target.value)}>
                  <option value="hi">Hindi (hi)</option>
                  <option value="en">English (en)</option>
                  <option value="en_US">English US (en_US)</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block font-medium">
                Template text <span className="font-normal text-ink-3">(exactly what customers see — the AI uses it as context)</span>
              </span>
              <textarea className={inputCls} rows={4} value={templateText} onChange={(e) => setTemplateText(e.target.value)} required />
            </label>
            <TemplateVariables templateText={templateText} params={params} onChange={setParams} hint="blank is allowed; may use {{name}}, {{city}}" />
            <label className="block">
              <span className="mb-1 block font-medium">Send rate: {rate} messages per minute</span>
              <input type="range" min={1} max={60} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="w-full" />
              <span className="text-xs text-ink-3">Start slow. Meta limits how many new people a WhatsApp number can message per day.</span>
            </label>
            {error && <ErrorState error={new Error(error)} />}
            <button type="submit" className={buttonClass('primary')} disabled={busy || !templateName.trim()}>
              Create campaign
            </button>
          </form>
        </Section>

        <Section title="Audience">
          <div className="space-y-3 px-5 py-4 text-sm">
            <p className="flex items-center gap-2">
              <Users size={16} className="text-brand" />
              <span className="text-2xl font-semibold tabular">{audience ? fmtNumber(audience.reachable) : '…'}</span>
              <span className="text-ink-2">contacts will be messaged</span>
            </p>
            {audience && (
              <p className="text-xs text-ink-3">
                {fmtNumber(audience.eligible)} eligible · {fmtNumber(audience.alreadyMessaged)} already messaged (skipped). Excluded automatically: Technotask-assigned, already on
                Desktop, opted out.
              </p>
            )}
            {audience?.reachable === 0 && (
              <p className="rounded-lg border border-warning/50 bg-warning/5 px-3 py-2">
                No one to message yet. <Link to="/customers/import" className="font-medium text-brand hover:underline">Upload contacts</Link> first.
              </p>
            )}
          </div>
        </Section>
      </div>
    </>
  );
}
