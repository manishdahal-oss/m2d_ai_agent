import type { SendResult, SendTemplateInput, SendTextInput, WhatsAppProvider } from './provider';

/** In-memory provider for tests and local development without credentials. Never sends anything. */
export class MockWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'mock';
  readonly sent: Array<{ kind: 'template'; input: SendTemplateInput } | { kind: 'text'; input: SendTextInput }> = [];
  private n = 0;

  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    this.sent.push({ kind: 'template', input });
    return { ok: true, providerMessageId: `mock-${++this.n}`, httpStatus: 200, raw: { mock: true } };
  }

  async sendText(input: SendTextInput): Promise<SendResult> {
    this.sent.push({ kind: 'text', input });
    return { ok: true, providerMessageId: `mock-${++this.n}`, httpStatus: 200, raw: { mock: true } };
  }
}
