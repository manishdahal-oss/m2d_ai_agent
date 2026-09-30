/**
 * CSV → import rows + preview statistics.
 *
 * Runs in the browser so the preview is instant and the file never has to be uploaded whole.
 * The Convex `customers.importChunk` mutation re-validates every row on commit (phone,
 * eligibility, opt-out) — the client is never trusted for what gets stored.
 *
 * Every valid, de-duplicated row lands in exactly one bucket, in priority order:
 *   opted out > assigned to Technotask > already on Desktop > already contacted > eligible
 */
import Papa from 'papaparse';
import { normalizeLanguage } from '../languages.ts';
import type { ColumnMapping, ExclusionReason, ImportRowIssue, ImportStats } from '../types.ts';
import { exclusionReason, type EligibilityRules } from './eligibility.ts';
import { mapColumns, REQUIRED_FIELDS, type StandardField } from './fields.ts';
import { normalizePhone } from './phone.ts';

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 200_000;
export const MAX_ISSUES = 200;

export class ImportError extends Error {}

export type RowFields = Partial<Record<StandardField, string | null>>;

/** One row as sent to the server. `phone` is the raw value; the server normalises it again. */
export interface ImportRow {
  row: number;
  fields: RowFields;
  attributes: Record<string, string>;
}

export interface ParsedCsv {
  headers: string[];
  columns: ColumnMapping[];
  mappedFields: StandardField[];
  missingRequired: StandardField[];
  rows: ImportRow[];
  sample: Array<Record<string, string>>;
}

export interface ExistingCustomerInfo {
  phone: string;
  externalId: string | null;
  assignedAgent: string | null;
  desktopStatus: string | null;
  optedOutAt: number | null;
  contacted: boolean;
}

export interface PreparedRow extends ImportRow {
  phoneE164: string;
  exclusion: ExclusionReason | null;
}

export interface ImportAnalysis {
  stats: ImportStats;
  issues: ImportRowIssue[];
  /** Valid, de-duplicated rows to send to the server. */
  rows: PreparedRow[];
}

const clean = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' || /^(null|n\/a|na|-)$/i.test(s) ? null : s;
};

export function parseCsv(text: string): ParsedCsv {
  if (new Blob([text]).size > MAX_IMPORT_BYTES) throw new ImportError('File is larger than 25 MB.');
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: 'greedy' });
  const headers = (parsed.meta.fields ?? []).filter((h) => h.trim() !== '');
  if (!headers.length) throw new ImportError('The file has no header row.');
  if (parsed.data.length > MAX_IMPORT_ROWS) throw new ImportError(`Too many rows (max ${MAX_IMPORT_ROWS.toLocaleString()}).`);

  const mapping = mapColumns(headers);
  const mappedFields = mapping.flatMap((m) => (m.target ? [m.target] : []));
  const rows = parsed.data.map((raw, idx) => {
    const fields: RowFields = {};
    const attributes: Record<string, string> = {};
    for (const col of mapping) {
      const value = clean(raw[col.source]);
      if (col.target) fields[col.target] = value;
      else if (value !== null && col.key) attributes[col.key] = value;
    }
    if (fields.language) {
      const code = normalizeLanguage(fields.language);
      if (!code) attributes.language_raw = fields.language;
      fields.language = code;
    }
    return { row: idx + 1, fields, attributes };
  });

  return {
    headers,
    columns: mapping.map((m) => ({ source: m.source, target: m.target })),
    mappedFields,
    missingRequired: REQUIRED_FIELDS.filter((f) => !mappedFields.includes(f)),
    rows,
    sample: parsed.data.slice(0, 5).map((r) => Object.fromEntries(headers.map((h) => [h, r[h] ?? '']))),
  };
}

/** Step 1: normalise phones and de-duplicate. Returns the phones/ids to look up. */
export function validateRows(csv: ParsedCsv) {
  const issues: ImportRowIssue[] = [];
  const addIssue = (i: ImportRowIssue) => issues.length < MAX_ISSUES && issues.push(i);
  let invalidNumbers = 0;
  let duplicatesInFile = 0;
  const valid: Array<ImportRow & { phoneE164: string }> = [];
  const firstRow = new Map<string, number>();

  if (csv.missingRequired.length) return { valid, issues, invalidNumbers: csv.rows.length, duplicatesInFile };

  for (const r of csv.rows) {
    const phone = normalizePhone(r.fields.phone);
    if (!phone.ok) {
      invalidNumbers++;
      addIssue({ row: r.row, phone: r.fields.phone ?? null, name: r.fields.name ?? null, reason: phone.reason });
      continue;
    }
    const seen = firstRow.get(phone.e164);
    if (seen !== undefined) {
      duplicatesInFile++;
      addIssue({ row: r.row, phone: r.fields.phone ?? null, name: r.fields.name ?? null, reason: `Duplicate of row ${seen}` });
      continue;
    }
    firstRow.set(phone.e164, r.row);
    valid.push({ ...r, phoneE164: phone.e164 });
  }
  return { valid, issues, invalidNumbers, duplicatesInFile };
}

/** Step 2: classify validated rows against what already exists in the database. */
export function analyzeImport(
  csv: ParsedCsv,
  validated: ReturnType<typeof validateRows>,
  existing: ExistingCustomerInfo[],
  rules: EligibilityRules,
): ImportAnalysis {
  const byPhone = new Map(existing.map((e) => [e.phone, e]));
  const phoneByExternalId = new Map(existing.flatMap((e) => (e.externalId ? [[e.externalId, e.phone] as const] : [])));
  const issues = [...validated.issues];
  const addIssue = (i: ImportRowIssue) => issues.length < MAX_ISSUES && issues.push(i);
  const stats: ImportStats = {
    totalRows: csv.rows.length,
    validNumbers: 0,
    invalidNumbers: validated.invalidNumbers,
    duplicatesInFile: validated.duplicatesInFile,
    alreadyAssigned: 0,
    alreadyOnDesktop: 0,
    optedOut: 0,
    alreadyContacted: 0,
    eligible: 0,
    newCustomers: 0,
    existingCustomers: 0,
  };
  const has = (f: StandardField) => csv.mappedFields.includes(f);
  const rows: PreparedRow[] = [];

  for (const r of validated.valid) {
    const ext = r.fields.customer_id;
    if (ext && phoneByExternalId.has(ext) && phoneByExternalId.get(ext) !== r.phoneE164) {
      stats.invalidNumbers++;
      addIssue({ row: r.row, phone: r.fields.phone ?? null, name: r.fields.name ?? null, reason: `customer_id ${ext} already exists with a different phone number` });
      continue;
    }
    const e = byPhone.get(r.phoneE164) ?? null;
    stats.validNumbers++;
    if (e) stats.existingCustomers++;
    else stats.newCustomers++;
    const exclusion = exclusionReason(
      {
        assignedAgent: has('assigned_agent') ? (r.fields.assigned_agent ?? null) : (e?.assignedAgent ?? null),
        desktopStatus: has('desktop_status') ? (r.fields.desktop_status ?? null) : (e?.desktopStatus ?? null),
        optedOutAt: e?.optedOutAt ? new Date(e.optedOutAt) : null,
      },
      rules,
    );
    if (exclusion === 'OPTED_OUT') stats.optedOut++;
    else if (exclusion === 'ASSIGNED_TO_HUMAN') stats.alreadyAssigned++;
    else if (exclusion === 'DESKTOP_ALREADY_ACTIVE') stats.alreadyOnDesktop++;
    else if (e?.contacted) stats.alreadyContacted++;
    else stats.eligible++;
    rows.push({ ...r, exclusion });
  }
  return { stats, issues, rows };
}
