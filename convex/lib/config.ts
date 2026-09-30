/**
 * Server-side configuration from Convex environment variables
 * (`npx convex env set NAME value`). The ONLY place env vars are read.
 * Secrets never leave the backend — callers get booleans / public values.
 */
import { parseAllowList, type AllowList } from '../../shared/access';
import type { EligibilityRules } from '../../shared/customerImport/eligibility';

/** Who may sign in to the dashboard. Empty = nobody (fail closed). */
export function allowList(): AllowList {
  return parseAllowList(process.env.ALLOWED_EMAILS, process.env.ALLOWED_EMAIL_DOMAINS);
}

const env = (key: string, fallback = ''): string => (process.env[key] ?? fallback).trim();

export const DESKTOP_ACTIVE_VALUES = ['active', 'activated', 'installed', 'yes', 'true', 'desktop', 'using'] as const;

export function eligibilityRules(): EligibilityRules {
  return {
    excludedAssigneePattern: env('EXCLUDED_ASSIGNEE_PATTERN', 'technotask'),
    desktopActiveValues: DESKTOP_ACTIVE_VALUES,
  };
}

export const desktopDownloadUrl = () => env('DESKTOP_DOWNLOAD_URL') || null;

export function timesConfig() {
  return {
    apiUrl: env('TIMES_API_URL'),
    apiKey: env('TIMES_API_KEY'),
    webhookSecret: env('TIMES_WEBHOOK_SECRET'),
  };
}

const missing = (pairs: ReadonlyArray<readonly [string, string]>) => pairs.filter(([, value]) => !value).map(([key]) => key);

/** Sending needs only the API URL + key (the Times account is bound to the key). */
export function timesSendingMissing(): string[] {
  const t = timesConfig();
  return missing([
    ['TIMES_API_URL', t.apiUrl],
    ['TIMES_API_KEY', t.apiKey],
  ]);
}

/** Receiving (phase 5) additionally needs a way to verify webhook calls. */
export function timesWebhookMissing(): string[] {
  return missing([['TIMES_WEBHOOK_SECRET', timesConfig().webhookSecret]]);
}

export function nvidiaConfig() {
  return {
    apiKey: env('NVIDIA_API_KEY'),
    baseUrl: env('NVIDIA_BASE_URL', 'https://integrate.api.nvidia.com/v1'),
    model: env('NVIDIA_MODEL', 'nvidia/nemotron-3-super-120b-a12b'),
  };
}

export type AutoReplyMode = 'off' | 'test_only' | 'contacted' | 'all';

/** Conversation-engine settings (all overridable with `npx convex env set`). */
export function engineConfig() {
  const mode = env('AUTO_REPLY_MODE', 'test_only');
  const limit = Number(env('MESSAGE_LIMIT', '10'));
  return {
    /**
     * off       = store replies only, send nothing
     * test_only = reply only to numbers used in Settings test sends
     * contacted = reply to anyone WE messaged first (campaign recipients + tests)  ← live setting
     * all       = reply to anyone who messages the number
     */
    autoReplyMode: (['off', 'test_only', 'contacted', 'all'].includes(mode) ? mode : 'test_only') as AutoReplyMode,
    /** Max messages we send per customer (template + replies). The last one is the closing message. */
    messageLimit: Number.isInteger(limit) && limit >= 2 ? limit : 10,
    helpline: env('HELPLINE_NUMBER', '+91 9333911911'),
    /** Wait this long after a customer message so a burst of messages gets ONE reply. */
    replyDebounceMs: Number(env('REPLY_DEBOUNCE_MS', '30000')), // wait for the customer to finish typing, then reply once
  };
}
