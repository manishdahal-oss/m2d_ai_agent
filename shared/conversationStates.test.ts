import { describe, expect, it } from 'vitest';
import { CONVERSATION_STATES, STATE_META, TRANSITIONS, canTransition } from './conversationStates.ts';

describe('conversation state machine', () => {
  it('has metadata and a transition list for every state', () => {
    for (const s of CONVERSATION_STATES) {
      expect(STATE_META[s]).toBeDefined();
      expect(TRANSITIONS[s]).toBeDefined();
    }
  });

  it('only references known states', () => {
    for (const targets of Object.values(TRANSITIONS)) for (const t of targets) expect(CONVERSATION_STATES).toContain(t);
  });

  it('STOPPED (opt-out) is terminal', () => {
    expect(TRANSITIONS.STOPPED).toEqual([]);
    expect(canTransition('STOPPED', 'AI_CONVERSATION')).toBe(false);
  });

  it('any active state can opt out or escalate to a human', () => {
    for (const s of ['MESSAGE_SENT', 'CUSTOMER_REPLIED', 'AI_CONVERSATION', 'INTERESTED', 'DESKTOP_LINK_SENT'] as const) {
      expect(canTransition(s, 'STOPPED')).toBe(true);
      expect(canTransition(s, 'NEEDS_HUMAN')).toBe(true);
    }
  });

  it('a human can hand a conversation back to the AI', () => {
    expect(canTransition('NEEDS_HUMAN', 'AI_CONVERSATION')).toBe(true);
  });

  it('follows the happy path and rejects skipping the first message', () => {
    expect(canTransition('NEW', 'MESSAGE_SENT')).toBe(true);
    expect(canTransition('MESSAGE_SENT', 'CUSTOMER_REPLIED')).toBe(true);
    expect(canTransition('DESKTOP_LINK_SENT', 'LINK_CLICKED')).toBe(true);
    expect(canTransition('NEW', 'CUSTOMER_REPLIED')).toBe(false);
    expect(canTransition('DESKTOP_ACTIVATED', 'INTERESTED')).toBe(false);
  });
});
