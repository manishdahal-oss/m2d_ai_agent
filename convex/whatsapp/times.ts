/**
 * Times WhatsApp API provider (vyaparm2d.timespanel.in).
 *
 * Request format is WhatsApp Cloud API–compatible:
 *   POST {TIMES_API_URL}/messages/send
 *   Authorization: <api key>            (raw key, no "Bearer")
 *   { messaging_product: "whatsapp", recipient_type: "individual", to, type, template | text }
 *
 * Observed response envelope: { status: boolean, message, message_id, code, res_json }.
 *   - bad key          → 401 "Invalid Api Key"
 *   - invalid payload  → 400 "Model invalid" (res_json lists the fields)
 *
 * Retries: only when the provider clearly did NOT accept the message (429 / 502 / 503).
 * Times has no idempotency key, so retrying after an ambiguous failure (timeout, 500) could
 * send twice — those are reported as failed + retryable and left to the caller/worker.
 */
import { toProviderNumber, type SendResult, type SendTemplateInput, type SendTextInput, type WhatsAppProvider } from './provider';

export interface TimesConfig {
  apiUrl: string;
  apiKey: string;
  timeoutMs?: number;
  maxAttempts?: number;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

type TimesEnvelope = {
  status?: boolean;
  message?: string;
  message_id?: string | null;
  code?: number;
  res_json?: unknown;
};

const RETRY_STATUSES = new Set([429, 502, 503]);

function extractMessageId(body: TimesEnvelope): string | null {
  if (body.message_id) return String(body.message_id);
  // Cloud API style fallback: { messages: [{ id }] } possibly nested in res_json.
  const nested = body.res_json as { messages?: Array<{ id?: string }> } | undefined;
  return nested?.messages?.[0]?.id ?? null;
}

function describeError(body: TimesEnvelope, status: number): string {
  const details = Array.isArray(body.res_json)
    ? body.res_json
        .map((d) => Object.values(d as Record<string, string>).join(' '))
        .join('; ')
    : '';
  return [body.message ?? `HTTP ${status}`, details].filter(Boolean).join(' — ').slice(0, 500);
}

/** WhatsApp rejects empty variables; a zero-width space shows as blank (e.g. "Hi {{1}}," → "Hi ,"). */
const BLANK = '\u200B';

export class TimesProvider implements WhatsAppProvider {
  readonly name = 'times';
  private readonly cfg: Required<Omit<TimesConfig, 'fetchImpl' | 'sleep'>> & Pick<TimesConfig, 'fetchImpl' | 'sleep'>;

  constructor(cfg: TimesConfig) {
    this.cfg = { timeoutMs: 15_000, maxAttempts: 3, ...cfg, apiUrl: cfg.apiUrl.replace(/\/+$/, '') };
  }

  sendTemplate({ to, templateName, languageCode, bodyParams = [] }: SendTemplateInput): Promise<SendResult> {
    return this.send({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toProviderNumber(to),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(bodyParams.length
          ? { components: [{ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text: text.trim() || BLANK })) }] }
          : {}),
      },
    });
  }

  sendText({ to, text }: SendTextInput): Promise<SendResult> {
    return this.send({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toProviderNumber(to),
      type: 'text',
      text: { preview_url: true, body: text },
    });
  }

  private async send(payload: unknown): Promise<SendResult> {
    const fetchImpl = this.cfg.fetchImpl ?? fetch;
    const sleep = this.cfg.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    let last: SendResult | null = null;

    for (let attempt = 1; attempt <= this.cfg.maxAttempts; attempt++) {
      let res: Response;
      try {
        res = await fetchImpl(`${this.cfg.apiUrl}/messages/send`, {
          method: 'POST',
          headers: { Authorization: this.cfg.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.cfg.timeoutMs),
        });
      } catch (err) {
        // Timeout / connection reset: the message MAY have been accepted — never auto-retry.
        return { ok: false, retryable: true, error: `Network error: ${err instanceof Error ? err.message : String(err)}`, httpStatus: null, raw: null };
      }

      const body = (await res.json().catch(() => ({}))) as TimesEnvelope;
      if (res.ok && body.status !== false) {
        return { ok: true, providerMessageId: extractMessageId(body), httpStatus: res.status, raw: body };
      }
      last = { ok: false, retryable: RETRY_STATUSES.has(res.status) || res.status >= 500, error: describeError(body, res.status), httpStatus: res.status, raw: body };
      if (!RETRY_STATUSES.has(res.status) || attempt === this.cfg.maxAttempts) return last;
      await sleep(500 * 2 ** (attempt - 1)); // 0.5s, 1s
    }
    return last!;
  }
}
