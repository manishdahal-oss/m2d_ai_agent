import { fillTemplate, placeholderCount } from '../../shared/templates.ts';

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-ink-3 focus:border-brand focus:ring-2 focus:ring-brand/20';

/** One input per {{1}}, {{2}}… in the template text, plus a preview of what the customer sees. */
export function TemplateVariables({ templateText, params, onChange, hint }: { templateText: string; params: string[]; onChange: (p: string[]) => void; hint?: string }) {
  const count = placeholderCount(templateText);
  const values = Array.from({ length: count }, (_, i) => params[i] ?? '');
  const set = (i: number, value: string) => onChange(values.map((p, j) => (j === i ? value : p)));

  return (
    <div className="space-y-2">
      {count > 0 && (
        <div>
          <span className="mb-1 block font-medium">
            Template variables {hint && <span className="font-normal text-ink-3">({hint})</span>}
          </span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {values.map((p, i) => (
              <label key={i} className="flex items-center gap-2">
                <code className="shrink-0 text-xs text-ink-3">{`{{${i + 1}}}`}</code>
                <input className={inputCls} value={p} onChange={(e) => set(i, e.target.value)} placeholder="(blank)" />
              </label>
            ))}
          </div>
        </div>
      )}
      <div>
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-3">Customer sees</span>
        <p className="whitespace-pre-wrap rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">{fillTemplate(templateText, values) || '—'}</p>
      </div>
    </div>
  );
}

/** Params trimmed to the template's placeholders (blank ones kept, so positions don't shift). */
export const paramsFor = (templateText: string, params: string[]) => Array.from({ length: placeholderCount(templateText) }, (_, i) => (params[i] ?? '').trim());
