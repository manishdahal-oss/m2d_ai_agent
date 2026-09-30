/**
 * Normalise WhatsApp webhook payloads into provider-neutral events.
 *
 * Times sends in WhatsApp Cloud API format, so the primary shape is Meta's:
 *   { object, entry: [{ changes: [{ field: "messages", value: { contacts, messages, statuses } }] }] }
 * A flat fallback ({ from, text|message|body, id|message_id }) is also accepted. Anything we can't
 * parse is still stored raw (webhookEvents) so the mapping can be fixed from real data.
 */

export type InboundMessageEvent = {
  kind: 'message';
  providerMessageId: string;
  /** Digits only as received, e.g. "919876543210". */
  from: string;
  profileName: string | null;
  /** Text we can show/answer. For buttons/lists it's the tapped option's title. */
  text: string;
  /** Original WhatsApp type: text, button, interactive, image, audio, … */
  messageType: string;
  timestamp: number | null; // ms
};

export type StatusEvent = {
  kind: 'status';
  providerMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | string;
  recipient: string | null;
  error: string | null;
  timestamp: number | null;
};

export type WebhookEvent = InboundMessageEvent | StatusEvent;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);
const ts = (v: unknown): number | null => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n; // WhatsApp sends seconds
};

const MEDIA_LABEL: Record<string, string> = {
  image: '[photo]',
  video: '[video]',
  audio: '[voice message]',
  voice: '[voice message]',
  document: '[document]',
  sticker: '[sticker]',
  location: '[location]',
  contacts: '[contact card]',
};

function messageText(m: Obj): { text: string; type: string } {
  const type = str(m.type) ?? 'text';
  if (isObj(m.text) && str(m.text.body)) return { text: str(m.text.body)!, type };
  if (isObj(m.button)) return { text: str(m.button.text) ?? str(m.button.payload) ?? '', type };
  if (isObj(m.interactive)) {
    const i = m.interactive;
    const reply = (isObj(i.button_reply) && i.button_reply) || (isObj(i.list_reply) && i.list_reply) || null;
    if (reply) return { text: str(reply.title) ?? str(reply.id) ?? '', type };
  }
  const caption = isObj(m[type]) ? str((m[type] as Obj).caption) : null;
  return { text: [MEDIA_LABEL[type] ?? `[${type}]`, caption].filter(Boolean).join(' '), type };
}

function parseCloudApiValue(value: Obj): WebhookEvent[] {
  const events: WebhookEvent[] = [];
  const contacts = Array.isArray(value.contacts) ? value.contacts.filter(isObj) : [];
  const nameFor = (waId: string) => {
    const c = contacts.find((x) => str(x.wa_id) === waId) ?? contacts[0];
    return c && isObj(c.profile) ? str(c.profile.name) : null;
  };
  for (const m of Array.isArray(value.messages) ? value.messages.filter(isObj) : []) {
    const id = str(m.id);
    const from = str(m.from);
    if (!id || !from) continue;
    const { text, type } = messageText(m);
    events.push({ kind: 'message', providerMessageId: id, from, profileName: nameFor(from), text, messageType: type, timestamp: ts(m.timestamp) });
  }
  for (const s of Array.isArray(value.statuses) ? value.statuses.filter(isObj) : []) {
    const id = str(s.id);
    const status = str(s.status);
    if (!id || !status) continue;
    const errors = Array.isArray(s.errors) ? s.errors.filter(isObj) : [];
    const error = errors.length ? errors.map((e) => [str(e.code), str(e.title), isObj(e.error_data) ? str(e.error_data.details) : null].filter(Boolean).join(' ')).join('; ') : null;
    events.push({ kind: 'status', providerMessageId: id, status: status.toLowerCase(), recipient: str(s.recipient_id), error, timestamp: ts(s.timestamp) });
  }
  return events;
}

export function parseWebhookPayload(payload: unknown): WebhookEvent[] {
  if (Array.isArray(payload)) return payload.flatMap(parseWebhookPayload);
  if (!isObj(payload)) return [];

  // Meta Cloud API envelope.
  if (Array.isArray(payload.entry)) {
    return payload.entry.filter(isObj).flatMap((e) =>
      (Array.isArray(e.changes) ? e.changes.filter(isObj) : []).flatMap((c) => (isObj(c.value) ? parseCloudApiValue(c.value) : [])),
    );
  }
  // Bare "value" object (some BSPs forward only this part).
  if (Array.isArray(payload.messages) || Array.isArray(payload.statuses)) return parseCloudApiValue(payload);

  // Flat fallback.
  const from = str(payload.from) ?? str(payload.mobile) ?? str(payload.sender) ?? str(payload.wa_id);
  const id = str(payload.id) ?? str(payload.message_id) ?? str(payload.messageId);
  const body = isObj(payload.text) ? str(payload.text.body) : (str(payload.text) ?? str(payload.message) ?? str(payload.body));
  if (from && id && body) {
    return [{ kind: 'message', providerMessageId: id, from, profileName: str(payload.name), text: body, messageType: 'text', timestamp: ts(payload.timestamp) }];
  }
  return [];
}
