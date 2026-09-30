/**
 * Conversation state machine for an M2D (Mobile → Desktop) WhatsApp conversation.
 * Shared by the server (authoritative transitions) and the dashboard (labels/colours).
 *
 *   NEW → MESSAGE_SENT → CUSTOMER_REPLIED → AI_CONVERSATION → INTERESTED
 *       → DESKTOP_LINK_SENT → LINK_CLICKED → INSTALLATION_STARTED → DESKTOP_ACTIVATED
 *
 * Side exits: NOT_INTERESTED, NEEDS_HUMAN (reversible), STOPPED (opt-out, terminal), FAILED.
 */

export const CONVERSATION_STATES = [
  'NEW',
  'MESSAGE_SENT',
  'CUSTOMER_REPLIED',
  'AI_CONVERSATION',
  'INTERESTED',
  'DESKTOP_LINK_SENT',
  'LINK_CLICKED',
  'INSTALLATION_STARTED',
  'DESKTOP_ACTIVATED',
  'NOT_INTERESTED',
  'STOPPED',
  'NEEDS_HUMAN',
  'FAILED',
] as const;

export type ConversationState = (typeof CONVERSATION_STATES)[number];

/** Progress order along the happy path. Used to avoid moving a conversation "backwards". */
const PROGRESS: ConversationState[] = [
  'NEW',
  'MESSAGE_SENT',
  'CUSTOMER_REPLIED',
  'AI_CONVERSATION',
  'INTERESTED',
  'DESKTOP_LINK_SENT',
  'LINK_CLICKED',
  'INSTALLATION_STARTED',
  'DESKTOP_ACTIVATED',
];

export function progressIndex(state: ConversationState): number {
  return PROGRESS.indexOf(state);
}

/**
 * Allowed transitions. Anything not listed is rejected by the server.
 * - STOPPED is terminal: an opted-out customer is never messaged again.
 * - NEEDS_HUMAN can return to any active state when a human hands back to the AI.
 * - FAILED (send failure) can be retried back to NEW / MESSAGE_SENT.
 */
const ACTIVE_AFTER_REPLY: ConversationState[] = [
  'CUSTOMER_REPLIED',
  'AI_CONVERSATION',
  'INTERESTED',
  'DESKTOP_LINK_SENT',
  'LINK_CLICKED',
  'INSTALLATION_STARTED',
  'DESKTOP_ACTIVATED',
];
const ALWAYS_ALLOWED: ConversationState[] = ['STOPPED', 'NEEDS_HUMAN', 'FAILED'];

export const TRANSITIONS: Record<ConversationState, ConversationState[]> = {
  NEW: ['MESSAGE_SENT', ...ALWAYS_ALLOWED],
  MESSAGE_SENT: ['CUSTOMER_REPLIED', 'LINK_CLICKED', ...ALWAYS_ALLOWED],
  CUSTOMER_REPLIED: ['AI_CONVERSATION', 'INTERESTED', 'DESKTOP_LINK_SENT', 'NOT_INTERESTED', ...ALWAYS_ALLOWED],
  AI_CONVERSATION: ['INTERESTED', 'DESKTOP_LINK_SENT', 'NOT_INTERESTED', ...ALWAYS_ALLOWED],
  INTERESTED: ['AI_CONVERSATION', 'DESKTOP_LINK_SENT', 'NOT_INTERESTED', ...ALWAYS_ALLOWED],
  DESKTOP_LINK_SENT: ['LINK_CLICKED', 'INSTALLATION_STARTED', 'DESKTOP_ACTIVATED', 'NOT_INTERESTED', ...ALWAYS_ALLOWED],
  LINK_CLICKED: ['INSTALLATION_STARTED', 'DESKTOP_ACTIVATED', 'NOT_INTERESTED', ...ALWAYS_ALLOWED],
  INSTALLATION_STARTED: ['DESKTOP_ACTIVATED', ...ALWAYS_ALLOWED],
  DESKTOP_ACTIVATED: ['NEEDS_HUMAN', 'STOPPED'],
  // A customer who said "not interested" may change their mind in a later reply.
  NOT_INTERESTED: ['CUSTOMER_REPLIED', 'AI_CONVERSATION', 'INTERESTED', ...ALWAYS_ALLOWED],
  STOPPED: [],
  NEEDS_HUMAN: [...ACTIVE_AFTER_REPLY, 'NOT_INTERESTED', 'STOPPED', 'FAILED'],
  FAILED: ['NEW', 'MESSAGE_SENT', 'STOPPED', 'NEEDS_HUMAN'],
};

export function canTransition(from: ConversationState, to: ConversationState): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

/** States in which the AI/campaign must never send another message. */
export const NO_MESSAGE_STATES: ConversationState[] = ['STOPPED'];

/** States considered an "active conversation" for the dashboard. */
export const ACTIVE_STATES: ConversationState[] = [
  'CUSTOMER_REPLIED',
  'AI_CONVERSATION',
  'INTERESTED',
  'DESKTOP_LINK_SENT',
  'LINK_CLICKED',
  'INSTALLATION_STARTED',
];

export type StateTone = 'neutral' | 'info' | 'progress' | 'good' | 'warning' | 'critical';

export const STATE_META: Record<ConversationState, { label: string; tone: StateTone; description: string }> = {
  NEW: { label: 'New', tone: 'neutral', description: 'Enrolled, not yet messaged' },
  MESSAGE_SENT: { label: 'Message sent', tone: 'info', description: 'Initial WhatsApp message sent' },
  CUSTOMER_REPLIED: { label: 'Replied', tone: 'info', description: 'Customer replied' },
  AI_CONVERSATION: { label: 'In conversation', tone: 'info', description: 'AI is conversing with the customer' },
  INTERESTED: { label: 'Interested', tone: 'progress', description: 'Customer showed interest in Desktop' },
  DESKTOP_LINK_SENT: { label: 'Link sent', tone: 'progress', description: 'Desktop download link sent' },
  LINK_CLICKED: { label: 'Link clicked', tone: 'progress', description: 'Customer opened the download link' },
  INSTALLATION_STARTED: { label: 'Installing', tone: 'progress', description: 'Customer started installing Desktop' },
  DESKTOP_ACTIVATED: { label: 'Activated', tone: 'good', description: 'Customer activated Vyapar Desktop' },
  NOT_INTERESTED: { label: 'Not interested', tone: 'neutral', description: 'Customer declined' },
  STOPPED: { label: 'Opted out', tone: 'warning', description: 'Customer asked not to be contacted — never message again' },
  NEEDS_HUMAN: { label: 'Needs human', tone: 'critical', description: 'Waiting for a human agent' },
  FAILED: { label: 'Failed', tone: 'critical', description: 'Message delivery or processing failed' },
};

export function isConversationState(v: unknown): v is ConversationState {
  return typeof v === 'string' && (CONVERSATION_STATES as readonly string[]).includes(v);
}
