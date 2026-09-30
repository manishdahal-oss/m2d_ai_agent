/**
 * NVIDIA NIM (Nemotron) via the OpenAI-compatible chat completions API.
 * Free endpoints are rate-limited — callers must handle failures (the engine falls back to
 * knowledge-only replies).
 */
import type { ChatMessage, LLMProvider, LLMResult } from './provider';

export interface NvidiaConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class NvidiaLLMProvider implements LLMProvider {
  readonly name = 'nvidia';
  constructor(private readonly cfg: NvidiaConfig) {}

  async complete(messages: ChatMessage[], opts: { maxTokens?: number; temperature?: number } = {}): Promise<LLMResult> {
    // Free endpoints return 429/503 under load: retry briefly, then let the caller fall back.
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.once(messages, opts);
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (attempt >= 3 || (status !== 429 && status !== 503 && status !== 502)) throw err;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }

  private async once(messages: ChatMessage[], opts: { maxTokens?: number; temperature?: number }): Promise<LLMResult> {
    const started = Date.now();
    const res = await (this.cfg.fetchImpl ?? fetch)(`${this.cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.cfg.model,
        messages,
        temperature: opts.temperature ?? 0.2,
        top_p: 0.9,
        max_tokens: opts.maxTokens ?? 400,
        stream: false,
        // Nemotron 3 "thinks" by default; we need the answer only (and never store reasoning).
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 40_000),
    });
    if (!res.ok) throw Object.assign(new Error(`NVIDIA ${res.status}: ${(await res.text()).slice(0, 300)}`), { status: res.status });
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };
    const text = body.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) throw new Error('NVIDIA returned an empty response');
    return {
      text,
      model: body.model ?? this.cfg.model,
      inputTokens: body.usage?.prompt_tokens ?? null,
      outputTokens: body.usage?.completion_tokens ?? null,
      latencyMs: Date.now() - started,
    };
  }
}
