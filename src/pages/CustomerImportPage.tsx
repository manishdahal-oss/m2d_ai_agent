import { useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, RotateCcw, Upload, XCircle } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import {
  analyzeImport,
  ImportError,
  MAX_IMPORT_BYTES,
  MAX_ISSUES,
  parseCsv,
  validateRows,
  type ExistingCustomerInfo,
  type ImportAnalysis,
  type ParsedCsv,
} from '../../shared/customerImport/prepare.ts';
import type { ImportRowIssue, ImportStats } from '../../shared/types.ts';
import { fmtNumber, fmtRelative } from '../lib/format.ts';
import { ErrorState, PageHeader, Section, buttonClass } from '../components/ui.tsx';

const TEMPLATE =
  'customer_id,name,phone,language,city,business_type,plan,mobile_usage,assigned_agent,desktop_status\n' +
  'VY-1001,Rahul Sharma,+91 98765 43210,English,Jaipur,Retail,Free,High,,\n';

const FIELD_LABEL: Record<string, string> = {
  customer_id: 'Customer ID',
  name: 'Name',
  phone: 'Phone',
  language: 'Language',
  city: 'City',
  business_type: 'Business type',
  plan: 'Plan',
  mobile_usage: 'Mobile usage',
  assigned_agent: 'Assigned agent',
  desktop_status: 'Desktop status',
};

const LOOKUP_CHUNK = 400;
const COMMIT_CHUNK = 250;

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'm2d-customers-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function Stat({ label, value, tone, hint }: { label: string; value: number; tone?: 'good' | 'bad' | 'muted'; hint?: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="flex items-center gap-1.5 text-xs text-ink-2">
        {tone === 'good' && <CheckCircle2 size={13} className="text-good" aria-hidden />}
        {tone === 'bad' && <XCircle size={13} className="text-critical" aria-hidden />}
        {label}
      </dt>
      <dd className={`mt-1 text-xl font-semibold tabular ${tone === 'muted' ? 'text-ink-2' : ''}`}>{fmtNumber(value)}</dd>
      {hint && <p className="text-[11px] text-ink-3">{hint}</p>}
    </div>
  );
}

function ValidationSummary({ stats: s }: { stats: ImportStats }) {
  const invalid = s.invalidNumbers + s.duplicatesInFile;
  return (
    <>
      <dl className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total uploaded" value={s.totalRows} />
        <Stat label="Valid numbers" value={s.validNumbers} tone="good" />
        <Stat label="Invalid numbers" value={invalid} tone={invalid ? 'bad' : undefined} hint={s.duplicatesInFile ? `incl. ${s.duplicatesInFile} duplicates` : undefined} />
        <Stat label="Already assigned" value={s.alreadyAssigned} tone="muted" hint="Technotask / human calling" />
        <Stat label="Already contacted" value={s.alreadyContacted} tone="muted" />
        <Stat label="Eligible for campaign" value={s.eligible} tone="good" />
      </dl>
      <p className="px-5 py-3 text-xs text-ink-3">
        Also excluded: {fmtNumber(s.alreadyOnDesktop)} already on Desktop, {fmtNumber(s.optedOut)} opted out. · {fmtNumber(s.newCustomers)} new,{' '}
        {fmtNumber(s.existingCustomers)} already in the database (will be updated).
      </p>
    </>
  );
}

type Preview = { csv: ParsedCsv; analysis: ImportAnalysis };
type Result = { inserted: number; updated: number; serverIssues: ImportRowIssue[] };

export function CustomerImportPage() {
  const convex = useConvex();
  const settings = useQuery(api.settings.get);
  const history = useQuery(api.customers.listImports, { limit: 20 });
  const startImport = useMutation(api.customers.startImport);
  const importChunk = useMutation(api.customers.importChunk);
  const finishImport = useMutation(api.customers.finishImport);

  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const accept = async (f: File | undefined) => {
    reset();
    if (!f) return;
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') return setError('Please choose a .csv file. (Export Excel sheets as CSV first.)');
    if (f.size > MAX_IMPORT_BYTES) return setError('File is larger than 25 MB.');
    setFile(f);
    setAnalyzing(true);
    try {
      // The live settings subscription may not have arrived yet (e.g. file picked right after load).
      const rules = (settings ?? (await convex.query(api.settings.get, {}))).eligibility;
      const csv = parseCsv(await f.text());
      const validated = validateRows(csv);
      // Look up existing customers (opt-outs, assignments, already contacted) in chunks.
      const phones = validated.valid.map((r) => r.phoneE164);
      const externalIds = validated.valid.flatMap((r) => (r.fields.customer_id ? [r.fields.customer_id] : []));
      const existing: ExistingCustomerInfo[] = [];
      for (let i = 0; i < Math.max(phones.length, externalIds.length); i += LOOKUP_CHUNK) {
        existing.push(
          ...(await convex.query(api.customers.lookupForImport, {
            phones: phones.slice(i, i + LOOKUP_CHUNK),
            externalIds: externalIds.slice(i, i + LOOKUP_CHUNK),
          })),
        );
      }
      setPreview({ csv, analysis: analyzeImport(csv, validated, existing, rules) });
    } catch (e) {
      setError(e instanceof ImportError || e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  };

  const commit = async () => {
    if (!preview || !file) return;
    const { csv, analysis } = preview;
    setError(null);
    setProgress({ done: 0, total: analysis.rows.length });
    try {
      const batchId: Id<'importBatches'> = await startImport({ filename: file.name, columns: csv.columns });
      let inserted = 0;
      let updated = 0;
      const serverIssues: ImportRowIssue[] = [];
      for (let i = 0; i < analysis.rows.length; i += COMMIT_CHUNK) {
        const chunk = analysis.rows.slice(i, i + COMMIT_CHUNK).map(({ row, fields, attributes }) => ({
          row,
          fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v ?? null])),
          attributes,
        }));
        const r = await importChunk({ batchId, mappedFields: csv.mappedFields, rows: chunk });
        inserted += r.inserted;
        updated += r.updated;
        serverIssues.push(...r.issues);
        setProgress({ done: Math.min(i + COMMIT_CHUNK, analysis.rows.length), total: analysis.rows.length });
      }
      await finishImport({ batchId, stats: analysis.stats, issues: [...analysis.issues, ...serverIssues].slice(0, MAX_ISSUES) });
      setResult({ inserted, updated, serverIssues });
    } catch (e) {
      setError(`Import stopped: ${e instanceof Error ? e.message : String(e)}. Rows already saved are kept; re-uploading the file is safe (it updates, never duplicates).`);
    } finally {
      setProgress(null);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    void accept(e.dataTransfer.files[0]);
  };

  const p = preview?.analysis;
  const csv = preview?.csv;

  return (
    <>
      <Link to="/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> Customers
      </Link>
      <PageHeader
        title="Upload customers"
        description="Import a CSV of Vyapar mobile customers. Phones are validated and eligibility is checked before anything is saved."
        actions={
          <button onClick={downloadTemplate} className={buttonClass('secondary')}>
            <Download size={16} /> CSV template
          </button>
        }
      />

      {!file && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition ${drag ? 'border-brand bg-brand-soft' : 'border-line bg-surface'}`}
        >
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand">
            <FileSpreadsheet size={22} />
          </div>
          <p className="font-medium">Drag a CSV file here</p>
          <p className="mt-1 text-sm text-ink-2">
            Required column: <span className="font-medium text-ink">phone</span>. Recognised: customer_id, name, language, city, business_type, plan, mobile_usage,
            assigned_agent, desktop_status. Any other column is kept as a custom attribute.
          </p>
          <label className={buttonClass('primary', 'mt-5 cursor-pointer')}>
            <Upload size={16} /> Choose file
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void accept(e.target.files?.[0])} data-testid="csv-input" />
          </label>
          {error && <p className="mt-3 text-sm text-critical">{error}</p>}
        </div>
      )}

      {file && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <FileSpreadsheet size={18} className="text-brand" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-ink-3">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button onClick={reset} className={buttonClass('ghost')} disabled={!!progress}>
              <RotateCcw size={15} /> Choose another file
            </button>
          </div>

          {analyzing && <p className="text-sm text-ink-2" role="status">Validating…</p>}
          {error && <ErrorState error={new Error(error)} />}

          {result && p && (
            <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-good/40 bg-good/5 px-4 py-3 text-sm">
              <CheckCircle2 size={18} className="text-good" aria-hidden />
              <p className="flex-1">
                <span className="font-semibold">Import complete.</span> {fmtNumber(result.inserted)} new customers added, {fmtNumber(result.updated)} updated.{' '}
                {fmtNumber(p.stats.eligible)} are eligible for the campaign.
                {result.serverIssues.length > 0 && ` ${result.serverIssues.length} rows were rejected by the server.`}
              </p>
              <Link to="/customers?eligibility=ELIGIBLE" className={buttonClass('secondary')}>
                View eligible customers
              </Link>
            </div>
          )}

          {p && csv && (
            <>
              <Section title="Validation" description={result ? 'Imported' : 'Preview — nothing has been saved yet'}>
                <ValidationSummary stats={p.stats} />
              </Section>

              {csv.missingRequired.length > 0 && (
                <ErrorState error={new Error(`Missing required column: ${csv.missingRequired.join(', ')}. Rename the column in your CSV (e.g. "phone" or "mobile_number").`)} />
              )}

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Section title="Column mapping" description="How your columns are read">
                  <ul className="divide-y divide-line text-sm">
                    {csv.columns.map((c) => (
                      <li key={c.source} className="flex items-center justify-between gap-3 px-5 py-2">
                        <span className="truncate font-mono text-xs">{c.source}</span>
                        <span className={c.target ? 'font-medium' : 'text-ink-3'}>{c.target ? FIELD_LABEL[c.target] : 'Custom attribute'}</span>
                      </li>
                    ))}
                  </ul>
                </Section>

                <Section title="Rows that will be skipped" description={p.issues.length ? `Showing the first ${p.issues.length}` : undefined}>
                  {p.issues.length === 0 ? (
                    <p className="flex items-center gap-2 px-5 py-4 text-sm text-ink-2">
                      <CheckCircle2 size={15} className="text-good" /> Every row has a valid, unique phone number.
                    </p>
                  ) : (
                    <div className="max-h-80 overflow-auto scroll-thin">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-surface">
                          <tr className="border-b border-line text-left text-xs text-ink-3">
                            <th className="px-5 py-2 font-medium">Row</th>
                            <th className="px-3 py-2 font-medium">Phone</th>
                            <th className="px-5 py-2 font-medium">Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.issues.map((i) => (
                            <tr key={`${i.row}-${i.reason}`} className="border-b border-line last:border-0">
                              <td className="px-5 py-2 tabular text-ink-2">{i.row}</td>
                              <td className="px-3 py-2 font-mono text-xs">{i.phone ?? '—'}</td>
                              <td className="px-5 py-2">{i.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>
              </div>

              {!result && (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => void commit()}
                    disabled={!!progress || csv.missingRequired.length > 0 || p.stats.validNumbers === 0}
                    className={buttonClass('primary')}
                  >
                    <Upload size={16} />
                    {progress ? 'Importing…' : `Import ${fmtNumber(p.stats.validNumbers)} customers`}
                  </button>
                  {progress ? (
                    <div className="flex min-w-48 flex-1 items-center gap-3" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-r-[4px] bg-series-1 transition-[width]" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
                      </div>
                      <span className="text-xs text-ink-2 tabular">
                        {fmtNumber(progress.done)} / {fmtNumber(progress.total)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-ink-3">Invalid and duplicate rows are skipped. Opted-out customers stay opted out.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {history && history.length > 0 && (
        <Section title="Upload history" className="mt-8">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th className="px-5 py-2 font-medium">File</th>
                  <th className="px-3 py-2 text-right font-medium">Rows</th>
                  <th className="px-3 py-2 text-right font-medium">Valid</th>
                  <th className="px-3 py-2 text-right font-medium">Eligible</th>
                  <th className="px-3 py-2 text-right font-medium">New / updated</th>
                  <th className="px-5 py-2 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b._id} className="border-b border-line last:border-0">
                    <td className="max-w-[16rem] truncate px-5 py-2">{b.filename}</td>
                    <td className="px-3 py-2 text-right tabular">{fmtNumber(b.stats?.totalRows)}</td>
                    <td className="px-3 py-2 text-right tabular">{fmtNumber(b.stats?.validNumbers)}</td>
                    <td className="px-3 py-2 text-right tabular">{fmtNumber(b.stats?.eligible)}</td>
                    <td className="px-3 py-2 text-right tabular">
                      {fmtNumber(b.inserted)} / {fmtNumber(b.updated)}
                    </td>
                    <td className="px-5 py-2 text-right text-ink-2">{b.status === 'IN_PROGRESS' ? 'Incomplete' : fmtRelative(b._creationTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </>
  );
}
