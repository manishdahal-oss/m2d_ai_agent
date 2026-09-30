/**
 * Public WhatsApp webhook: https://<deployment>.convex.site/webhooks/whatsapp
 *
 * POST: inbound messages + delivery statuses from Times. Always answers fast (200) — the
 *       conversation engine runs afterwards (scheduled), so Times never times out and retries.
 * GET:  Meta-style verification (hub.mode / hub.verify_token / hub.challenge).
 *
 * Authentication: if TIMES_WEBHOOK_SECRET is set, requests must carry it as `?key=…` or an
 * `X-Webhook-Secret` header. Until Times documents a signature, abuse is limited anyway:
 * free-text replies only reach numbers that messaged us in the last 24h, and every customer
 * is capped at MESSAGE_LIMIT messages.
 */
import { parseWebhookPayload } from '../../shared/whatsappWebhook';
import { internal } from '../_generated/api';
import { httpAction } from '../_generated/server';
import { timesConfig } from '../lib/config';

const MAX_BODY_BYTES = 512 * 1024;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorised(req: Request): boolean {
  const secret = timesConfig().webhookSecret;
  if (!secret) return true;
  const given = new URL(req.url).searchParams.get('key') ?? req.headers.get('x-webhook-secret') ?? '';
  return safeEqual(given, secret);
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const receive = httpAction(async (ctx, req) => {
  if (!authorised(req)) return json(401, { ok: false, error: 'unauthorised' });
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return json(413, { ok: false, error: 'payload too large' });
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { unparseableBody: text.slice(0, 4000) };
  }
  const headers: Record<string, string> = {};
  for (const [k, v] of req.headers) if (!/authorization|cookie|secret/i.test(k)) headers[k] = v.slice(0, 500);

  const r = await ctx.runMutation(internal.engine.recordWebhook, { raw: payload, events: parseWebhookPayload(payload), headers });
  return json(200, { ok: true, ...r });
});

export const verify = httpAction(async (_ctx, req) => {
  const url = new URL(req.url);
  const challenge = url.searchParams.get('hub.challenge');
  const token = url.searchParams.get('hub.verify_token') ?? '';
  const secret = timesConfig().webhookSecret;
  if (challenge && (!secret || safeEqual(token, secret))) return new Response(challenge, { status: 200 });
  return json(200, { ok: true, service: 'vyapar-m2d-whatsapp-webhook' });
});
