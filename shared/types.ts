/**
 * Domain types shared by Convex functions and the dashboard.
 * Document shapes come from Convex's generated types (convex/_generated/dataModel);
 * this file holds only the cross-cutting enums and computed-result contracts.
 */
import type { ConversationState } from './conversationStates.ts';

export type CampaignStatus = 'DRAFT' | 'READY' | 'RUNNING' | 'PAUSED' | 'COMPLETED';

/** Why a customer is not eligible for campaigns. */
export type ExclusionReason = 'ASSIGNED_TO_HUMAN' | 'OPTED_OUT' | 'DESKTOP_ALREADY_ACTIVE';

export const EXCLUSION_LABEL: Record<ExclusionReason, string> = {
  ASSIGNED_TO_HUMAN: 'Assigned to Technotask',
  OPTED_OUT: 'Opted out',
  DESKTOP_ALREADY_ACTIVE: 'Already on Desktop',
};

/* ───────── CSV import ───────── */

export interface ImportRowIssue {
  row: number; // 1-based data row (excluding header)
  phone: string | null;
  name: string | null;
  reason: string;
}

export interface ImportStats {
  totalRows: number;
  validNumbers: number;
  invalidNumbers: number;
  duplicatesInFile: number;
  alreadyAssigned: number;
  alreadyOnDesktop: number;
  optedOut: number;
  alreadyContacted: number;
  eligible: number;
  newCustomers: number;
  existingCustomers: number;
}

export interface ColumnMapping {
  source: string;
  target: string | null; // standard field, or null → stored as a custom attribute
}

/* ───────── Analytics (result of the analytics.compute action) ───────── */

export interface OverviewMetrics {
  customersUploaded: number;
  eligibleCustomers: number;
  messagesSent: number;
  delivered: number;
  customerReplies: number;
  activeConversations: number;
  interested: number;
  linksSent: number;
  linksClicked: number;
  activated: number;
  needsHuman: number;
  notInterested: number;
  optedOut: number;
}

export interface FunnelStage {
  key: 'eligible' | 'contacted' | 'replied' | 'interested' | 'linkSent' | 'linkClicked' | 'activated';
  label: string;
  count: number;
}

export interface AnalyticsFilters {
  campaignId?: string;
  language?: string;
  segment?: string; // business_type
  from?: string; // YYYY-MM-DD (IST)
  to?: string;
}

export interface CampaignStats {
  enrolled: number;
  contacted: number;
  replied: number;
  interested: number;
  linkSent: number;
  activated: number;
  needsHuman: number;
}

export interface AnalyticsResponse {
  filters: AnalyticsFilters;
  metrics: OverviewMetrics;
  campaignStats: Record<string, CampaignStats>;
  funnel: FunnelStage[];
  conversionRate: number | null; // activations / eligible
  byLanguage: Array<{ language: string | null; eligible: number; contacted: number; replied: number; interested: number; activated: number }>;
  byState: Array<{ state: ConversationState; count: number }>;
  options: { campaigns: Array<{ id: string; name: string }>; languages: string[]; segments: string[] };
  computedAt: number;
}

/* ───────── Approved knowledge ───────── */

export interface KnowledgeItem {
  id: string;
  topic: string;
  content: string;
  approved: boolean;
  source: string;
}

export interface KnowledgeFaq {
  id: string;
  question: string;
  answer: string;
  approved: boolean;
  source: string;
}

export interface KnowledgeBase {
  version: string;
  productName: string;
  facts: KnowledgeItem[];
  installationSteps: KnowledgeItem[];
  faqs: KnowledgeFaq[];
  openItems: string[];
}
