import { useQuery } from 'convex/react';
import { AlertTriangle, CheckCircle2, CircleDashed, Database, MessageCircle, Sparkles } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { KeyValue, Loading, PageHeader, Section } from '../components/ui.tsx';
import { TestSendPanel } from '../components/TestSendPanel.tsx';
import { WebhookPanel } from '../components/WebhookPanel.tsx';
import { PreviewPanel } from '../components/PreviewPanel.tsx';

function Status({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium">
      <CheckCircle2 size={15} className="text-good" aria-hidden /> {okLabel}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium">
      <AlertTriangle size={15} className="text-warning" aria-hidden /> {badLabel}
    </span>
  );
}

export function SettingsPage() {
  const s = useQuery(api.settings.get);
  if (s === undefined) return <Loading />;
  const kb = s.knowledge;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Read-only. Credentials are Convex environment variables (npx convex env set …) and are never sent to the browser."
      />
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Section title="Database · Convex">
            <div className="space-y-3 px-5 py-4">
              <Status ok okLabel="Connected (live)" badLabel="Not connected" />
              <KeyValue
                items={[
                  ['Deployment', <span className="break-all font-mono text-xs">{s.database.url ?? '—'}</span>],
                  ['Webhook base URL', <span className="break-all font-mono text-xs">{s.webhookBaseUrl ?? '—'}</span>],
                ]}
              />
              <p className="flex items-center gap-1.5 text-xs text-ink-3">
                <Database size={12} /> Times will call the webhook on this public URL (phase 5).
              </p>
            </div>
          </Section>
          <Section title="WhatsApp · Times API">
            <div className="space-y-3 px-5 py-4">
              <Status ok={s.whatsapp.sendingConfigured} okLabel="Sending ready" badLabel="Sending not configured" />
              <Status ok okLabel="Replies (webhook) listening" badLabel="" />
              <KeyValue
                items={[
                  ['API host', s.whatsapp.apiHost ?? '—'],
                  ...(s.whatsapp.sendingMissing.length ? ([['Missing', s.whatsapp.sendingMissing.join(', ')]] as Array<[string, string]>) : []),
                ]}
              />
              <p className="flex items-center gap-1.5 text-xs text-ink-3">
                <MessageCircle size={12} /> Replies arrive on the webhook below.
              </p>
            </div>
          </Section>
          <Section title="AI · NVIDIA Nemotron">
            <div className="space-y-3 px-5 py-4">
              <Status ok={s.llm.configured} okLabel="API key set" badLabel="Not configured" />
              <KeyValue items={[['Model', s.llm.model ?? '—']]} />
              <p className="flex items-center gap-1.5 text-xs text-ink-3">
                <Sparkles size={12} /> Connected in phase 7. Free endpoints are rate-limited.
              </p>
            </div>
          </Section>
        </div>

        {s.whatsapp.sendingConfigured && <TestSendPanel />}
        <WebhookPanel s={s} />
        <PreviewPanel />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section title="Eligibility rules">
            <div className="px-5 py-4">
              <KeyValue
                items={[
                  ['Excluded when assigned_agent matches', <code className="text-xs">/{s.eligibility.excludedAssigneePattern}/i</code>],
                  ['Already on Desktop when desktop_status is', s.eligibility.desktopActiveValues.join(', ')],
                  ['Opted out', 'Always excluded, permanently'],
                  ['Default Desktop link', s.desktopDownloadUrl ?? 'Not set (DESKTOP_DOWNLOAD_URL)'],
                ]}
              />
            </div>
          </Section>
          <Section title="Languages" description="Enabled = the agent may converse in it. Others are ready to switch on.">
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2 px-5 py-4 text-sm sm:grid-cols-3">
              {s.languages.map((l) => (
                <li key={l.code} className="flex items-center gap-2">
                  {l.enabled ? <CheckCircle2 size={14} className="text-good" aria-label="Enabled" /> : <CircleDashed size={14} className="text-ink-3" aria-label="Not enabled" />}
                  <span className={l.enabled ? '' : 'text-ink-2'}>
                    {l.name} <span className="text-ink-3">{l.nativeName !== l.name ? l.nativeName : ''}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <Section
          title={`Approved knowledge · ${kb.productName}`}
          description={`Version ${kb.version}. The AI may only state facts listed here. Edit shared/knowledge/vyaparDesktop.ts.`}
        >
          <div className="grid gap-6 px-5 py-4 lg:grid-cols-2">
            <div className="space-y-5">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Approved facts</h3>
                <ul className="space-y-2 text-sm">
                  {kb.facts.filter((f) => f.approved).map((f) => (
                    <li key={f.id} className="flex gap-2">
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-good" aria-label="Approved" />
                      <span>
                        {f.content} <span className="text-xs text-ink-3">— {f.source}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              {kb.facts.some((f) => !f.approved) && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Draft features — not used until approved</h3>
                  <ul className="space-y-1.5 text-sm text-ink-2">
                    {kb.facts
                      .filter((f) => !f.approved)
                      .map((f) => (
                        <li key={f.id} className="flex gap-2">
                          <CircleDashed size={15} className="mt-0.5 shrink-0 text-ink-3" aria-label="Draft" />
                          <span>{f.content}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Approved answers</h3>
                <ul className="space-y-2 text-sm">
                  {kb.faqs.map((f) => (
                    <li key={f.id}>
                      <p className="font-medium">{f.question}</p>
                      <p className="text-ink-2">{f.answer}</p>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Installation steps</h3>
                {kb.installationSteps.length ? null : <p className="text-sm text-ink-3">None approved yet.</p>}
              </div>
            </div>
            <div className="rounded-lg border border-warning/50 bg-warning/5 p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <AlertTriangle size={15} className="text-warning" aria-hidden /> Needed before going live
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
                {kb.openItems.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          </div>
        </Section>
      </div>
    </>
  );
}
