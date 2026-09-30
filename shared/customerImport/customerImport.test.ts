import { describe, expect, it } from 'vitest';
import { exclusionReason } from './eligibility.ts';
import { mapColumns } from './fields.ts';
import { normalizePhone } from './phone.ts';
import { analyzeImport, parseCsv, validateRows } from './prepare.ts';

const rules = { excludedAssigneePattern: 'technotask', desktopActiveValues: ['active', 'installed'] };

describe('normalizePhone', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['0091-98765-43210', '+919876543210'],
    ['9.19876543210E+11', '+919876543210'],
    ['9876543210.0', '+919876543210'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toEqual({ ok: true, e164: expected });
  });

  it.each(['', '12345', 'abc', '1234567890', '+91 11 2345 6789'])('rejects %j', (input) => {
    expect(normalizePhone(input).ok).toBe(false);
  });
});

describe('mapColumns', () => {
  it('maps standard names and aliases, keeps unknown columns as attributes', () => {
    const m = mapColumns(['Customer ID', 'Mobile Number', 'Customer Name', 'Lang', 'GST Number', 'desktop_status']);
    expect(m.map((c) => c.target)).toEqual(['customer_id', 'phone', 'name', 'language', null, 'desktop_status']);
    expect(m[4].key).toBe('gst_number');
  });

  it('prefers an exact field name over an alias', () => {
    const m = mapColumns(['number', 'phone']);
    expect(m.find((c) => c.source === 'phone')?.target).toBe('phone');
    expect(m.find((c) => c.source === 'number')?.target).toBeNull();
  });
});

describe('exclusionReason', () => {
  it('opt-out wins over everything', () => {
    expect(exclusionReason({ assignedAgent: 'Technotask', desktopStatus: 'active', optedOutAt: new Date() }, rules)).toBe('OPTED_OUT');
  });
  it('excludes Technotask assignments (case-insensitive) but not other agents', () => {
    expect(exclusionReason({ assignedAgent: 'TechnoTask – Agent 4', desktopStatus: null, optedOutAt: null }, rules)).toBe('ASSIGNED_TO_HUMAN');
    expect(exclusionReason({ assignedAgent: 'In-house sales', desktopStatus: null, optedOutAt: null }, rules)).toBeNull();
  });
  it('excludes customers already on Desktop', () => {
    expect(exclusionReason({ assignedAgent: null, desktopStatus: 'Installed', optedOutAt: null }, rules)).toBe('DESKTOP_ALREADY_ACTIVE');
    expect(exclusionReason({ assignedAgent: null, desktopStatus: 'not installed', optedOutAt: null }, rules)).toBeNull();
  });
});

describe('import preview (browser-side analysis)', () => {
  const csv = [
    'customer_id,name,phone,language,city,business_type,assigned_agent,desktop_status,gst_number',
    'C1,Rahul,9876543210,English,Jaipur,Retail,,,08AAA',
    'C2,Priya,+91 98765 43211,hindi,Ahmedabad,Wholesale,Technotask Agent 3,,',
    'C3,Bad,12345,en,,,,,',
    'C4,Dup,98765 43210,en,,,,,',
    'C5,Desk,9876543212,en,,,,Active,',
    'C6,Meena,9876543213,Marathi,Pune,Grocery,,,',
    'C7,Old,9876543214,en,,,,,',
    'C8,Stop,9876543215,en,,,,,',
  ].join('\n');

  it('buckets every valid row exactly once, using what already exists', () => {
    const parsed = parseCsv(csv);
    const validated = validateRows(parsed);
    const existing = [
      { phone: '+919876543214', externalId: 'C7', assignedAgent: null, desktopStatus: null, optedOutAt: null, contacted: true },
      { phone: '+919876543215', externalId: 'C8', assignedAgent: null, desktopStatus: null, optedOutAt: Date.now(), contacted: true },
    ];
    const { stats, issues, rows } = analyzeImport(parsed, validated, existing, rules);
    expect(stats).toMatchObject({
      totalRows: 8,
      validNumbers: 6,
      invalidNumbers: 1,
      duplicatesInFile: 1,
      alreadyAssigned: 1,
      alreadyOnDesktop: 1,
      optedOut: 1,
      alreadyContacted: 1,
      eligible: 2,
      newCustomers: 4,
      existingCustomers: 2,
    });
    expect(stats.alreadyAssigned + stats.alreadyOnDesktop + stats.optedOut + stats.alreadyContacted + stats.eligible).toBe(stats.validNumbers);
    expect(issues.map((i) => i.reason)).toEqual(expect.arrayContaining(['Invalid number', 'Duplicate of row 1']));
    expect(rows.find((r) => r.fields.customer_id === 'C6')?.fields.language).toBe('mr');
    expect(parsed.columns.find((c) => c.source === 'gst_number')?.target).toBeNull();
  });

  it('flags a customer_id that already belongs to another phone', () => {
    const parsed = parseCsv('customer_id,phone\nC1,9876500000');
    const r = analyzeImport(parsed, validateRows(parsed), [{ phone: '+919876543210', externalId: 'C1', assignedAgent: null, desktopStatus: null, optedOutAt: null, contacted: false }], rules);
    expect(r.stats.validNumbers).toBe(0);
    expect(r.issues[0].reason).toMatch(/already exists with a different phone/);
  });

  it('reports a missing phone column', () => {
    const parsed = parseCsv('name,city\nA,B');
    expect(parsed.missingRequired).toEqual(['phone']);
    expect(validateRows(parsed).invalidNumbers).toBe(1);
  });
});
