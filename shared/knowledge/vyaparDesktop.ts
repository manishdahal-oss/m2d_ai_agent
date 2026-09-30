/**
 * APPROVED Vyapar Desktop knowledge.
 *
 * The AI agent may only state product facts listed here with `approved: true`.
 * Anything not covered must be answered with "I'll check with the team" / human hand-off —
 * never guessed. Every entry records its source so claims can be audited.
 *
 * Content below contains ONLY what the business has stated so far. Fill `openItems`
 * with the Vyapar product team before running a live campaign.
 */
import type { KnowledgeBase } from '../types.ts';

export const VYAPAR_DESKTOP_KNOWLEDGE: KnowledgeBase = {
  version: '2026-09-30.2',
  productName: 'Vyapar Desktop',
  facts: [
    {
      id: 'free-version',
      topic: 'Pricing',
      content: 'Vyapar Desktop has a free trial version.',
      approved: true,
      source: 'M2D project brief (2026-09-29)',
    },
    {
      id: 'larger-screen',
      topic: 'Benefit',
      content: 'Vyapar Desktop lets customers manage billing and other business activities on a larger screen, which can make some tasks more convenient for frequent users.',
      approved: true,
      source: 'M2D project brief (2026-09-29)',
    },
    // ── Advanced features — approved by the M2D owner on 2026-09-30 ────────────────────
    // The AI mentions a FEW of these (relevant to the customer), never the whole list.
    ...(
      [
        ['offline', 'Works offline — billing continues even without internet.'],
        ['gst', 'Create GST invoices and see GST reports (like GSTR-1 and GSTR-3B) directly.'],
        ['inventory', 'Track stock and get low-stock alerts.'],
        ['barcode', 'Bill faster using a barcode scanner.'],
        ['printing', 'Print invoices on regular and thermal printers.'],
        ['bulk-import', 'Add items and parties in bulk from Excel.'],
        ['backup-sync', 'Automatic backup, and data can be used on both mobile and desktop.'],
        ['multi-firm', 'Manage more than one business (firm) in the same app.'],
      ] as const
    ).map(([id, content]) => ({
      id: `feature-${id}`,
      topic: 'Feature',
      content,
      approved: true,
      source: 'Approved by M2D owner (dahalmanish50@gmail.com), 2026-09-30',
    })),
  ],
  installationSteps: [],
  faqs: [
    {
      id: 'is-it-free',
      question: 'Is Vyapar Desktop free? / What are the fees?',
      answer: 'Vyapar Desktop ka free trial version available hai. Kya aap ise try karna chahenge?',
      approved: true,
      source: 'M2D owner, 2026-09-30 (exact wording)',
    },
  ],
  openItems: [
    'System requirements (OS versions, RAM, disk)',
    'Step-by-step installation instructions',
    'How mobile data syncs / is shared with Desktop (and any login steps)',
    'What the free version includes vs paid plans; paid pricing (or: "do not discuss pricing")',
    'Approved answers to common objections (e.g. "I only use mobile", "No computer", "Data safety")',
    'Hindi versions of the approved answers, and official terms that must not be translated',
    'Support channel / timings for human hand-off',
  ],
};
