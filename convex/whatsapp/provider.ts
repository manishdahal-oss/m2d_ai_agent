/**
 * WhatsApp provider abstraction. Campaigns, the conversation engine and the webhook depend on
 * this interface only — never on a specific provider's HTTP API.
 */

export interface SendTemplateInput {
  /** E.164, e.g. +919876543210 */
  to: string;
  templateName: string;
  languageCode: string;
  /** Values for {{1}}, {{2}}, … in the template body, in order. */
  bodyParams?: string[];
}

export interface SendTextInput {
  to: string;
  text: string;
}

export type SendResult =
  | { ok: true; providerMessageId: string | null; httpStatus: number; raw: unknown }
  | {
      ok: false;
      /** true = safe to try again later (the provider did not accept the message). */
      retryable: boolean;
      error: string;
      httpStatus: number | null;
      raw: unknown;
    };

export interface WhatsAppProvider {
  readonly name: string;
  /** Approved template — the only way to start a conversation (outside the 24h window). */
  sendTemplate(input: SendTemplateInput): Promise<SendResult>;
  /** Free-form text — only valid within 24h of the customer's last message. */
  sendText(input: SendTextInput): Promise<SendResult>;
  /** Not all providers expose status lookups; delivery status normally arrives via webhook. */
  getMessageStatus?(providerMessageId: string): Promise<{ status: string; raw: unknown }>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(`WhatsApp provider is not configured (missing: ${missing.join(', ')})`);
  }
}

/** Providers take numbers without '+': +919876543210 → 919876543210 */
export function toProviderNumber(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) throw new Error(`Invalid recipient number: ${e164}`);
  return digits;
}
