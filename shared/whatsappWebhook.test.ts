import { describe, expect, it } from 'vitest';
import { parseWebhookPayload } from './whatsappWebhook.ts';

const cloud = (value: object) => ({ object: 'whatsapp_business_account', entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', ...value } }] }] });

describe('parseWebhookPayload', () => {
  it('parses a Cloud API text message with the profile name', () => {
    const events = parseWebhookPayload(
      cloud({
        contacts: [{ profile: { name: 'Rahul' }, wa_id: '919876543210' }],
        messages: [{ from: '919876543210', id: 'wamid.A', timestamp: '1790700000', type: 'text', text: { body: 'haan batao' } }],
      }),
    );
    expect(events).toEqual([
      { kind: 'message', providerMessageId: 'wamid.A', from: '919876543210', profileName: 'Rahul', text: 'haan batao', messageType: 'text', timestamp: 1790700000000 },
    ]);
  });

  it('parses button and interactive replies as their visible text', () => {
    const events = parseWebhookPayload(
      cloud({
        messages: [
          { from: '91', id: 'b1', type: 'button', button: { text: 'Yes, tell me', payload: 'YES' } },
          { from: '91', id: 'i1', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'x', title: 'Send link' } } },
        ],
      }),
    );
    expect(events.map((e) => e.kind === 'message' && e.text)).toEqual(['Yes, tell me', 'Send link']);
  });

  it('labels media messages instead of dropping them', () => {
    const [e] = parseWebhookPayload(cloud({ messages: [{ from: '91', id: 'm', type: 'image', image: { caption: 'my bill' } }] }));
    expect(e).toMatchObject({ kind: 'message', text: '[photo] my bill', messageType: 'image' });
  });

  it('parses delivery statuses including errors', () => {
    const events = parseWebhookPayload(
      cloud({
        statuses: [
          { id: 'wamid.S', status: 'delivered', recipient_id: '919876543210', timestamp: '1790700001' },
          { id: 'wamid.F', status: 'failed', recipient_id: '91', errors: [{ code: 131047, title: 'Re-engagement message', error_data: { details: 'More than 24 hours' } }] },
        ],
      }),
    );
    expect(events[0]).toMatchObject({ kind: 'status', providerMessageId: 'wamid.S', status: 'delivered' });
    expect(events[1]).toMatchObject({ kind: 'status', status: 'failed', error: '131047 Re-engagement message More than 24 hours' });
  });

  it('accepts a bare value object and a flat {from,text,id} payload', () => {
    expect(parseWebhookPayload({ messages: [{ from: '91', id: 'v', text: { body: 'hi' } }] })).toHaveLength(1);
    expect(parseWebhookPayload({ from: '919876543210', message: 'hello', message_id: 'f1' })).toMatchObject([{ kind: 'message', text: 'hello', providerMessageId: 'f1' }]);
  });

  it('returns nothing for unknown shapes (caller stores them raw)', () => {
    expect(parseWebhookPayload({ hello: 'world' })).toEqual([]);
    expect(parseWebhookPayload('nope')).toEqual([]);
  });
});
