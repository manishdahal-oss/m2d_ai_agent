/** Provider-independent LLM interface. The agent never imports a concrete provider. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResult {
  text: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

export interface LLMProvider {
  readonly name: string;
  complete(messages: ChatMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<LLMResult>;
}
