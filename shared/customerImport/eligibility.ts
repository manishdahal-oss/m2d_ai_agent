import type { ExclusionReason } from '../types.ts';

export interface EligibilityRules {
  excludedAssigneePattern: string;
  desktopActiveValues: readonly string[];
}

export interface EligibilityInput {
  assignedAgent: string | null;
  desktopStatus: string | null;
  optedOutAt: string | Date | null;
}

/**
 * Campaign eligibility. Order matters: opt-out always wins, so an opted-out
 * customer is never messaged, whatever else a new CSV says.
 */
export function exclusionReason(c: EligibilityInput, rules: EligibilityRules): ExclusionReason | null {
  if (c.optedOutAt) return 'OPTED_OUT';
  if (isAssignedToHuman(c.assignedAgent, rules)) return 'ASSIGNED_TO_HUMAN';
  if (c.desktopStatus && rules.desktopActiveValues.includes(c.desktopStatus.trim().toLowerCase())) return 'DESKTOP_ALREADY_ACTIVE';
  return null;
}

export function isAssignedToHuman(agent: string | null, rules: EligibilityRules): boolean {
  if (!agent?.trim()) return false;
  try {
    return new RegExp(rules.excludedAssigneePattern, 'i').test(agent);
  } catch {
    return agent.toLowerCase().includes(rules.excludedAssigneePattern.toLowerCase());
  }
}
