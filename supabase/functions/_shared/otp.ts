// WhatsApp login codes: everything the auth-whatsapp-otp function does, testable with plain Node.
// Supabase Auth calls it as its "Send SMS hook" whenever someone asks for a phone login code.
// The request is signed the "standard webhooks" way with SEND_SMS_HOOK_SECRET.
// Rules: never log the code, the login token or a full phone number.
import { GRAPH_VERSION, mapSendResponse, maskPhone, normalizePhone, readMode, scrub, type Env, type Log } from './pass.ts';

export const DEFAULT_OTP_TEMPLATE = 'sina_login_code';
const MAX_SKEW_S = 5 * 60;

/** Supabase hook answers: 200 {} = sent; otherwise {error: {http_code, message}} (shown to the person logging in). */
const ok = () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
const fail = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { http_code: status, message } }), { status, headers: { 'Content-Type': 'application/json' } });

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(b: ArrayBuffer): string {
  let s = '';
  for (const v of new Uint8Array(b)) s += String.fromCharCode(v);
  return btoa(s);
}
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length || !a.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** The signature for one request: base64(HMAC-SHA256(secret, "<id>.<timestamp>.<body>")). */
export async function signWebhook(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const keyB64 = secret.replace(/^v1,/, '').replace(/^whsec_/, '');
  const key = await crypto.subtle.importKey('raw', b64ToBytes(keyB64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToB64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
}

/**
 * Checks the standard-webhooks headers (webhook-id, webhook-timestamp, webhook-signature "v1,<base64> …")
 * against the raw body. The secret is as Supabase shows it ("v1,whsec_<base64>"). Refuses requests
 * more than 5 minutes old or from the future.
 */
export async function verifyWebhook(headers: Headers, body: string, secret: string | undefined, nowMs = Date.now()): Promise<boolean> {
  if (!secret) return false;
  const id = headers.get('webhook-id') ?? '', ts = headers.get('webhook-timestamp') ?? '', sig = headers.get('webhook-signature') ?? '';
  if (!id || !/^\d{1,12}$/.test(ts) || !sig) return false;
  if (Math.abs(nowMs / 1000 - Number(ts)) > MAX_SKEW_S) return false;
  let want: string;
  try { want = await signWebhook(secret, id, ts, body); } catch { return false; }
  return sig.split(' ').some((p) => p.startsWith('v1,') && sameText(p.slice(3), want));
}

/** The WhatsApp "authentication" template message with a copy-code button. */
export function buildOtpPayload(phone: string, code: string, template: string, lang: string) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'template',
    template: {
      name: template,
      language: { code: lang },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: code }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
      ],
    },
  };
}

export interface OtpDeps { fetch?: typeof fetch; log?: Log; now?: () => number; timeoutMs?: number }

/**
 * auth-whatsapp-otp. POST from Supabase Auth: {user: {phone, …}, sms: {otp}}.
 * OTP_MODE: off (default) → 503 "not switched on"; mock → answers sent, sends nothing; live → Meta Cloud API.
 */
export async function handleOtpHook(req: Request, env: Env, deps: OtpDeps): Promise<Response> {
  const log: Log = deps.log ?? (() => {});
  if (req.method !== 'POST') return fail(405, 'method not allowed');
  if (!env.SEND_SMS_HOOK_SECRET) return fail(500, 'login codes are not set up');
  const body = await req.text();
  if (!(await verifyWebhook(req.headers, body, env.SEND_SMS_HOOK_SECRET, deps.now ? deps.now() : Date.now()))) {
    return fail(401, 'bad signature');
  }
  let p: { user?: { phone?: string }; sms?: { otp?: string } };
  try { p = JSON.parse(body); } catch { return fail(400, 'bad request'); }
  const phone = normalizePhone(p?.user?.phone);
  const code = String(p?.sms?.otp ?? '');
  if (!phone || !/^\d{4,10}$/.test(code)) return fail(400, 'bad request');
  const mode = readMode(env.OTP_MODE);
  if (mode === 'off') return fail(503, 'WhatsApp login is not switched on');
  if (mode === 'mock') { log('code not sent (mock)', { phone: maskPhone(phone) }); return ok(); }
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return fail(500, 'login codes are not set up');
  const payload = buildOtpPayload(phone, code, env.WHATSAPP_OTP_TEMPLATE || DEFAULT_OTP_TEMPLATE, env.WHATSAPP_OTP_LANG || 'ar');
  let res: Response;
  try {
    res = await (deps.fetch ?? fetch)(`https://graph.facebook.com/${GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(deps.timeoutMs ?? 8000),
    });
  } catch (e) {
    log('code send failed', { phone: maskPhone(phone), error: scrub((e as Error)?.name || 'error', 40) });
    return fail(502, 'could not send the code, try again');
  }
  let j: unknown = null;
  try { j = await res.json(); } catch { /* not JSON */ }
  const out = mapSendResponse(res.status, j);
  if (out.ok) { log('code sent', { phone: maskPhone(phone) }); return ok(); }
  log('code send failed', { phone: maskPhone(phone), kind: out.kind, error: scrub(out.error, 120) });
  return fail(out.kind === 'final' ? 400 : 502, out.kind === 'final' ? 'this number can\'t get WhatsApp messages' : 'could not send the code, try again');
}
