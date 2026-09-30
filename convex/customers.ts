import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { exclusionReason } from '../shared/customerImport/eligibility';
import { STANDARD_FIELDS, type StandardField } from '../shared/customerImport/fields';
import { normalizePhone } from '../shared/customerImport/phone';
import { normalizeLanguage } from '../shared/languages';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { authedMutation as mutation, authedQuery as query } from './lib/access';
import { eligibilityRules } from './lib/config';
import { conversationSearchText, customerSearchText } from './lib/denormalize';
import { vConversationState, vEligibility, vImportStats } from './lib/validators';

/* ───────────────────────── Queries ───────────────────────── */

async function withLatestCampaign(ctx: QueryCtx, customers: Doc<'customers'>[]) {
  const campaignNames = new Map<Id<'campaigns'>, string>();
  return Promise.all(
    customers.map(async (c) => {
      let campaignName: string | null = null;
      if (c.latestConversationId) {
        const conv = await ctx.db.get(c.latestConversationId);
        if (conv) {
          if (!campaignNames.has(conv.campaignId)) campaignNames.set(conv.campaignId, (await ctx.db.get(conv.campaignId))?.name ?? '');
          campaignName = campaignNames.get(conv.campaignId) || null;
        }
      }
      return { ...c, campaignName };
    }),
  );
}

/** Live, paginated customer list with search + filters. */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    q: v.optional(v.string()),
    eligibility: v.optional(vEligibility),
    language: v.optional(v.string()), // ISO code, or 'unknown'
    state: v.optional(vConversationState),
    desktop: v.optional(v.union(v.literal('YES'), v.literal('NO'), v.literal('UNCONFIRMED'))),
  },
  handler: async (ctx, { paginationOpts, q, eligibility, language, state, desktop }) => {
    const desktopValue = desktop === 'UNCONFIRMED' ? undefined : desktop;
    const lang = language === 'unknown' ? undefined : language;
    const term = q?.trim();

    let page;
    if (term) {
      page = await ctx.db
        .query('customers')
        .withSearchIndex('search', (s) => {
          let x = s.search('searchText', term.replace(/^\+/, ''));
          if (eligibility) x = x.eq('eligibility', eligibility);
          if (language) x = x.eq('language', lang);
          if (state) x = x.eq('latestState', state);
          return x;
        })
        .filter((f) => (desktop ? f.eq(f.field('hasDesktop'), desktopValue) : true))
        .paginate(paginationOpts);
    } else {
      // Use the most selective index; filter the rest.
      const base = state
        ? ctx.db.query('customers').withIndex('by_state_activity', (i) => i.eq('latestState', state))
        : eligibility
          ? ctx.db.query('customers').withIndex('by_eligibility_activity', (i) => i.eq('eligibility', eligibility))
          : language
            ? ctx.db.query('customers').withIndex('by_language_activity', (i) => i.eq('language', lang))
            : ctx.db.query('customers').withIndex('by_activity');
      page = await base
        .order('desc')
        .filter((f) =>
          f.and(
            eligibility && state ? f.eq(f.field('eligibility'), eligibility) : true,
            language && (state || eligibility) ? f.eq(f.field('language'), lang) : true,
            desktop ? f.eq(f.field('hasDesktop'), desktopValue) : true,
          ),
        )
        .paginate(paginationOpts);
    }
    return { ...page, page: await withLatestCampaign(ctx, page.page) };
  },
});

/** Customer profile + every conversation with messages, AI metadata and state history. */
export const get = query({
  args: { id: v.id('customers') },
  handler: async (ctx, { id }) => {
    const customer = await ctx.db.get(id);
    if (!customer) return null;
    const convs = await ctx.db
      .query('conversations')
      .withIndex('by_customer', (i) => i.eq('customerId', id))
      .collect();
    convs.sort((a, b) => b.lastMessageAt - a.lastMessageAt);

    const conversations = await Promise.all(
      convs.map(async (c) => {
        const [campaign, messages, events, runs] = await Promise.all([
          ctx.db.get(c.campaignId),
          ctx.db.query('messages').withIndex('by_conversation', (i) => i.eq('conversationId', c._id)).collect(),
          ctx.db.query('conversationEvents').withIndex('by_conversation', (i) => i.eq('conversationId', c._id)).collect(),
          ctx.db.query('aiRuns').withIndex('by_conversation', (i) => i.eq('conversationId', c._id)).collect(),
        ]);
        const runByReply = new Map(runs.flatMap((r) => (r.replyMessageId ? [[r.replyMessageId, r] as const] : [])));
        return {
          ...c,
          campaignName: campaign?.name ?? 'Unknown campaign',
          events,
          messages: messages.map((m) => {
            const r = runByReply.get(m._id);
            // Only structured, display-safe AI metadata is returned — never raw model output.
            const ai = r
              ? { intent: r.intent ?? null, sentiment: r.sentiment ?? null, stage: r.stage ?? null, nextAction: r.nextAction ?? null, confidence: r.confidence ?? null, model: r.model ?? null, latencyMs: r.latencyMs ?? null }
              : null;
            const replySkipped = typeof m.metadata?.replySkipped === 'string' ? (m.metadata.replySkipped as string) : null;
            return { ...m, metadata: undefined, ai, replySkipped };
          }),
        };
      }),
    );
    return { customer, conversations };
  },
});

/* ───────────────────────── CSV import ───────────────────────── */

const MAX_LOOKUP = 500;
const MAX_CHUNK = 250;

/** Existing-customer facts needed for the import preview. */
export const lookupForImport = query({
  args: { phones: v.array(v.string()), externalIds: v.array(v.string()) },
  handler: async (ctx, { phones, externalIds }) => {
    if (phones.length > MAX_LOOKUP || externalIds.length > MAX_LOOKUP) throw new ConvexError(`At most ${MAX_LOOKUP} lookups per call`);
    const found = new Map<Id<'customers'>, Doc<'customers'>>();
    for (const phone of phones) {
      const c = await ctx.db.query('customers').withIndex('by_phone', (i) => i.eq('phone', phone)).unique();
      if (c) found.set(c._id, c);
    }
    for (const externalId of externalIds) {
      const c = await ctx.db.query('customers').withIndex('by_external_id', (i) => i.eq('externalId', externalId)).first();
      if (c) found.set(c._id, c);
    }
    return Promise.all(
      [...found.values()].map(async (c) => {
        const convs = await ctx.db.query('conversations').withIndex('by_customer', (i) => i.eq('customerId', c._id)).collect();
        return {
          phone: c.phone,
          externalId: c.externalId ?? null,
          assignedAgent: c.assignedAgent ?? null,
          desktopStatus: c.desktopStatus ?? null,
          optedOutAt: c.optedOutAt ?? null,
          contacted: convs.some((x) => x.contactedAt !== undefined),
        };
      }),
    );
  },
});

const vColumn = v.object({ source: v.string(), target: v.union(v.string(), v.null()) });
const vIssue = v.object({ row: v.number(), phone: v.union(v.string(), v.null()), name: v.union(v.string(), v.null()), reason: v.string() });

export const startImport = mutation({
  args: { filename: v.string(), columns: v.array(vColumn) },
  handler: (ctx, { filename, columns }) =>
    ctx.db.insert('importBatches', {
      filename: filename.slice(0, 255),
      importedBy: ctx.user._id,
      columns,
      issues: [],
      status: 'IN_PROGRESS',
      inserted: 0,
      updated: 0,
      skipped: 0,
    }),
});

type TextColumn = 'name' | 'language' | 'city' | 'businessType' | 'plan' | 'mobileUsage' | 'assignedAgent' | 'desktopStatus';

/** Field → customers column (phone/customer_id are handled separately). */
const COLUMN: Record<Exclude<StandardField, 'phone' | 'customer_id'>, TextColumn> = {
  name: 'name',
  language: 'language',
  city: 'city',
  business_type: 'businessType',
  plan: 'plan',
  mobile_usage: 'mobileUsage',
  assigned_agent: 'assignedAgent',
  desktop_status: 'desktopStatus',
};

/**
 * Upsert a chunk of rows. Re-validates everything server-side:
 * phone normalisation, customer_id conflicts, eligibility, sticky opt-out.
 * Only fields whose column is present in the file are overwritten.
 */
export const importChunk = mutation({
  args: {
    batchId: v.id('importBatches'),
    mappedFields: v.array(v.string()),
    rows: v.array(
      v.object({
        row: v.number(),
        fields: v.record(v.string(), v.union(v.string(), v.null())),
        attributes: v.record(v.string(), v.string()),
      }),
    ),
  },
  handler: async (ctx, { batchId, mappedFields, rows }) => {
    if (rows.length > MAX_CHUNK) throw new ConvexError(`At most ${MAX_CHUNK} rows per chunk`);
    const batch = await ctx.db.get(batchId);
    if (!batch || batch.status !== 'IN_PROGRESS') throw new ConvexError('Import batch is not in progress');
    const rules = eligibilityRules();
    const mapped = new Set(mappedFields.filter((f): f is StandardField => (STANDARD_FIELDS as readonly string[]).includes(f)));
    let inserted = 0;
    let updated = 0;
    const issues: Array<{ row: number; phone: string | null; name: string | null; reason: string }> = [];

    for (const r of rows) {
      const f = r.fields as Partial<Record<StandardField, string | null>>;
      const phone = normalizePhone(f.phone);
      if (!phone.ok) {
        issues.push({ row: r.row, phone: f.phone ?? null, name: f.name ?? null, reason: phone.reason });
        continue;
      }
      const existing = await ctx.db.query('customers').withIndex('by_phone', (i) => i.eq('phone', phone.e164)).unique();
      const externalId = f.customer_id ?? undefined;
      if (externalId) {
        const owner = await ctx.db.query('customers').withIndex('by_external_id', (i) => i.eq('externalId', externalId)).first();
        if (owner && owner.phone !== phone.e164) {
          issues.push({ row: r.row, phone: f.phone ?? null, name: f.name ?? null, reason: `customer_id ${externalId} already exists with a different phone number` });
          continue;
        }
      }

      const attributes = { ...r.attributes };
      const values: Partial<Record<TextColumn, string | undefined>> = {};
      for (const [field, column] of Object.entries(COLUMN) as Array<[keyof typeof COLUMN, TextColumn]>) {
        if (!mapped.has(field)) continue;
        let value = f[field] ?? undefined;
        if (field === 'language' && value) {
          const code = normalizeLanguage(value);
          if (!code) attributes.language_raw = value;
          value = code ?? undefined;
        }
        values[column] = value;
      }
      const merged: Partial<Doc<'customers'>> = { ...existing, ...values };
      const reason = exclusionReason(
        { assignedAgent: merged.assignedAgent ?? null, desktopStatus: merged.desktopStatus ?? null, optedOutAt: existing?.optedOutAt ? new Date(existing.optedOutAt) : null },
        rules,
      );
      const eligibility = reason ?? 'ELIGIBLE';
      const searchText = customerSearchText({ name: merged.name, phone: phone.e164, externalId: externalId ?? existing?.externalId, city: merged.city });

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...values,
          ...(externalId ? { externalId } : {}),
          phoneRaw: f.phone ?? undefined,
          attributes: { ...existing.attributes, ...attributes },
          eligibility, // opt-out is sticky: exclusionReason() returns OPTED_OUT when optedOutAt is set
          lastImportId: batchId,
          searchText,
        });
        // Keep denormalised customer fields on conversations in sync.
        if ('name' in values || 'language' in values || 'businessType' in values) {
          const convs = await ctx.db.query('conversations').withIndex('by_customer', (i) => i.eq('customerId', existing._id)).collect();
          for (const c of convs) {
            await ctx.db.patch(c._id, {
              customerName: merged.name,
              customerLanguage: merged.language,
              customerSegment: merged.businessType,
              searchText: conversationSearchText({ customerName: merged.name, customerPhone: c.customerPhone }),
            });
          }
        }
        updated++;
      } else {
        await ctx.db.insert('customers', {
          ...values,
          externalId,
          phone: phone.e164,
          phoneRaw: f.phone ?? undefined,
          attributes,
          eligibility,
          lastImportId: batchId,
          lastActivityAt: Date.now(),
          searchText,
          isDemo: false,
        });
        inserted++;
      }
    }

    await ctx.db.patch(batchId, {
      inserted: batch.inserted + inserted,
      updated: batch.updated + updated,
      skipped: batch.skipped + issues.length,
    });
    return { inserted, updated, issues };
  },
});

export const finishImport = mutation({
  args: { batchId: v.id('importBatches'), stats: vImportStats, issues: v.array(vIssue) },
  handler: async (ctx, { batchId, stats, issues }) => {
    const batch = await ctx.db.get(batchId);
    if (!batch) throw new ConvexError('Import batch not found');
    await ctx.db.patch(batchId, { status: 'COMPLETED', stats, issues: issues.slice(0, 200) });
    return { ...batch, status: 'COMPLETED' as const, stats };
  },
});

export const listImports = query({
  args: { limit: v.optional(v.number()) },
  handler: (ctx, { limit }) => ctx.db.query('importBatches').order('desc').take(Math.min(limit ?? 20, 100)),
});
