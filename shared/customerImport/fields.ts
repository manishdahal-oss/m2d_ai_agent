/**
 * CSV column → customer field mapping. Headers are normalised and matched against
 * aliases; unknown columns are kept as custom `attributes` (so new columns need no code change).
 */

export const STANDARD_FIELDS = [
  'customer_id',
  'name',
  'phone',
  'language',
  'city',
  'business_type',
  'plan',
  'mobile_usage',
  'assigned_agent',
  'desktop_status',
] as const;

export type StandardField = (typeof STANDARD_FIELDS)[number];

export const REQUIRED_FIELDS: StandardField[] = ['phone'];

const ALIASES: Record<StandardField, string[]> = {
  customer_id: ['customer_id', 'customerid', 'cust_id', 'user_id', 'userid', 'vyapar_id', 'id'],
  name: ['name', 'customer_name', 'full_name', 'business_owner', 'owner_name', 'contact_name'],
  phone: ['phone', 'phone_number', 'mobile', 'mobile_number', 'mobile_no', 'phone_no', 'contact_number', 'whatsapp', 'whatsapp_number', 'msisdn', 'number'],
  language: ['language', 'lang', 'preferred_language', 'language_preference'],
  city: ['city', 'town', 'location'],
  business_type: ['business_type', 'businesstype', 'business_category', 'category', 'industry', 'segment'],
  plan: ['plan', 'plan_type', 'subscription', 'subscription_plan', 'license', 'license_type'],
  mobile_usage: ['mobile_usage', 'usage', 'app_usage', 'mobile_activity', 'usage_level'],
  assigned_agent: ['assigned_agent', 'agent', 'assigned_to', 'owner', 'agent_email', 'team', 'assigned_team'],
  desktop_status: ['desktop_status', 'desktop', 'desktop_user', 'is_desktop_user', 'desktop_active'],
};

export function normalizeHeader(h: string): string {
  return h
    .replace(/^﻿/, '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Map each source header to a standard field (first match wins; each field used once).
 * Returns the mapping in source order.
 */
export function mapColumns(headers: string[]): Array<{ source: string; key: string; target: StandardField | null }> {
  const used = new Set<StandardField>();
  const normalized = headers.map((h) => ({ source: h, key: normalizeHeader(h) }));
  const result = normalized.map((h) => ({ ...h, target: null as StandardField | null }));

  // Two passes: exact field names first, then aliases — so "phone" beats "number".
  for (const pass of ['exact', 'alias'] as const) {
    for (const col of result) {
      if (col.target || !col.key) continue;
      for (const field of STANDARD_FIELDS) {
        if (used.has(field)) continue;
        const match = pass === 'exact' ? col.key === field : ALIASES[field].includes(col.key);
        if (match) {
          col.target = field;
          used.add(field);
          break;
        }
      }
    }
  }
  return result;
}
