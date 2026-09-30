import { v, type Infer } from 'convex/values';
import type { ConversationState } from '../../shared/conversationStates';

export const vConversationState = v.union(
  v.literal('NEW'),
  v.literal('MESSAGE_SENT'),
  v.literal('CUSTOMER_REPLIED'),
  v.literal('AI_CONVERSATION'),
  v.literal('INTERESTED'),
  v.literal('DESKTOP_LINK_SENT'),
  v.literal('LINK_CLICKED'),
  v.literal('INSTALLATION_STARTED'),
  v.literal('DESKTOP_ACTIVATED'),
  v.literal('NOT_INTERESTED'),
  v.literal('STOPPED'),
  v.literal('NEEDS_HUMAN'),
  v.literal('FAILED'),
);

// Compile-time guard: the validator must match the shared state machine exactly.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _statesMatch: Same<Infer<typeof vConversationState>, ConversationState> = true;
void _statesMatch;

export const vCampaignStatus = v.union(v.literal('DRAFT'), v.literal('READY'), v.literal('RUNNING'), v.literal('PAUSED'), v.literal('COMPLETED'));
export const vExclusionReason = v.union(v.literal('ASSIGNED_TO_HUMAN'), v.literal('OPTED_OUT'), v.literal('DESKTOP_ALREADY_ACTIVE'));
export const vEligibility = v.union(v.literal('ELIGIBLE'), v.literal('ASSIGNED_TO_HUMAN'), v.literal('OPTED_OUT'), v.literal('DESKTOP_ALREADY_ACTIVE'));
export const vMessageDirection = v.union(v.literal('INBOUND'), v.literal('OUTBOUND'));
export const vSenderType = v.union(v.literal('CUSTOMER'), v.literal('AI'), v.literal('HUMAN'), v.literal('SYSTEM'));
export const vMessageStatus = v.union(v.literal('QUEUED'), v.literal('SENT'), v.literal('DELIVERED'), v.literal('READ'), v.literal('FAILED'), v.literal('RECEIVED'));

export const vImportStats = v.object({
  totalRows: v.number(),
  validNumbers: v.number(),
  invalidNumbers: v.number(),
  duplicatesInFile: v.number(),
  alreadyAssigned: v.number(),
  alreadyOnDesktop: v.number(),
  optedOut: v.number(),
  alreadyContacted: v.number(),
  eligible: v.number(),
  newCustomers: v.number(),
  existingCustomers: v.number(),
});

export type Eligibility = Infer<typeof vEligibility>;
