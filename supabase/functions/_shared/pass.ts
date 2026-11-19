// Door passes on WhatsApp: everything the two server functions do, without Deno or
// network specifics, so it can be tested on a Mac with plain Node (no Deno needed).
//   send-door-passes  → handleSendRequest()
//   whatsapp-webhook  → handleWebhookRequest()
// The database side is supabase/migrations/0006_pass_sending.sql.
// Rules: never log a full phone number, invite token or pass key; never keep message text.

export const TZ = 'Asia/Kuwait';
export const GRAPH_VERSION = 'v21.0';
export const DEFAULT_TEMPLATE = 'sina_door_pass';

export type Mode = 'off' | 'mock' | 'live';
export type Env = Record<string, string | undefined>;
export type RpcResult = { data: unknown; error: { message: string } | null };
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
export type Log = (msg: string, fields?: Record<string, unknown>) => void;

/** One guest claimed by public.pass_send_claim. */
export interface Claim {
  guest_id: string;
  event_id: string;
  phone: string | null;
  name: string | null;
  people: number | null;
  token: string | null;
  lang: string | null;
  event_title: string | null;
  starts_at: string | null;
  venue: string | null;
}

/** What a sender returns for one message. */
export type SendOutcome =
  | { ok: true; msgId: string }
  | { ok: false; error: string; kind: ErrorKind };

/**
 * retry   = not sent; try again later (10 min × attempts, 3 tries)
 * final   = this guest can't get it (not on WhatsApp, bad number): no more tries
 * unclear = no clear answer (timeout, WhatsApp server error): it may have gone out, so no
 *           blind retry; the hosts' list shows it and the webhook marks it sent if it did go
 * config  = our setup is wrong (token, template, account): stop the run; the guest's try doesn't count
 */
export type ErrorKind = 'retry' | 'final' | 'config' | 'unclear';
const PREFIX: Record<ErrorKind, string> = { retry: '', final: 'final:', config: 'config:', unclear: 'unclear:' };

export interface TemplateOptions {
  template: string;   // WhatsApp template name
  langAr: string;     // template language code for Arabic events
  langEn: string;     // template language code for English events
}

// ---------------------------------------------------------------- phones
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩', FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/**
 * A phone as WhatsApp wants it: E.164 digits without '+'.
 * Same rules as App.normPhone in core.js (Arabic digits ok, 00 prefix dropped,
 * 8 digits = Kuwait → 965 in front), plus a length check. null = not usable.
 */
export function normalizePhone(raw: unknown): string | null {
  let d = String(raw ?? '')
    .replace(/[٠-٩]/g, (c) => String(AR_DIGITS.indexOf(c)))
    .replace(/[۰-۹]/g, (c) => String(FA_DIGITS.indexOf(c)))
    .replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) d = '965' + d;
  if (d.startsWith('965') && d.length !== 11) return null;   // Kuwait: 965 + 8 digits
  if (d.length < 8 || d.length > 15 || d.startsWith('0')) return null;
  return d;
}

/** '96550001234' → '+965•••••234'. Safe to log. */
export function maskPhone(p: unknown): string {
  const d = String(p ?? '').replace(/\D/g, '');
  if (!d) return '(none)';
  if (d.length <= 4) return '•'.repeat(d.length);
  const cc = d.startsWith('965') ? '965' : d.slice(0, 2);
  return '+' + cc + '•'.repeat(Math.max(1, d.length - cc.length - 3)) + d.slice(-3);
}

/** A token or key → its first 4 characters and a length. Safe to log. */
export function maskToken(t: unknown): string {
  const s = String(t ?? '');
  return s ? s.slice(0, 4) + '…(' + s.length + ')' : '(none)';
}

/** Hide anything in free text that could be a phone, token or key (for logs and stored errors). */
export function scrub(text: unknown, max = 200): string {
  return String(text ?? '')
    .replace(/[A-Za-z0-9_-]{20,}/g, '…')
    .replace(/\+?\d[\d\s-]{5,}\d/g, '…')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// ---------------------------------------------------------------- dates
/**
 * The event's date and time in Kuwait, as the guest reads it in the message:
 *   en: "Friday 18 December at 7:00 PM"
 *   ar: "الجمعة، ١٨ ديسمبر الساعة ٧:٠٠ م"   (Arabic digits, like the invite page)
 */
export function formatWhen(iso: string | null | undefined, lang: string | null | undefined): string {
  const en = lang === 'en';
  if (!iso || isNaN(Date.parse(iso))) return en ? 'the day of the event' : 'يوم المناسبة';
  const d = new Date(iso);
  const sp = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');
  if (en) {
    const date = d.toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
    const time = d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
    return sp(`${date} at ${time}`);
  }
  const date = d.toLocaleDateString('ar-KW', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
  const time = d.toLocaleTimeString('ar-KW', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  return sp(`${date} الساعة ${time}`);
}

// ---------------------------------------------------------------- message
/** WhatsApp refuses template values with new lines, tabs or more than 4 spaces in a row. */
export function cleanParam(s: unknown, max: number): string {
  return String(s ?? '').replace(/[\r\n\t\u2028\u2029]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, max).trim();
}

const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * The WhatsApp Cloud API body for one guest (template message).
 * Body values: {{1}} guest name, {{2}} event, {{3}} date and time in Kuwait.
 * Button 0 (URL, dynamic): the template's URL is <SITE_URL>/invite.html?t={{1}}, the value is the invite token.
 * biz_opaque_callback_data = the guest id: WhatsApp sends it back with each delivery update, so a message
 * whose id we never saved (sender stopped, database didn't answer, timeout) is still matched to its guest.
 */
export function buildPayload(c: Claim, o: TemplateOptions):
  { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  const to = normalizePhone(c.phone);
  if (!to) return { ok: false, error: 'final:bad_phone' };
  const token = String(c.token ?? '');
  if (!TOKEN_RE.test(token)) return { ok: false, error: 'final:bad_token' };
  const en = c.lang === 'en';
  const name = cleanParam(c.name, 60) || (en ? 'there' : 'ضيفنا');
  const event = cleanParam(c.event_title, 80) || (en ? 'the event' : 'المناسبة');
  const when = cleanParam(formatWhen(c.starts_at, c.lang), 80);
  return {
    ok: true,
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      biz_opaque_callback_data: String(c.guest_id),
      type: 'template',
      template: {
        name: o.template,
        language: { code: en ? o.langEn : o.langAr },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: name }, { type: 'text', text: event }, { type: 'text', text: when }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: token }] },
        ],
      },
    },
  };
}

// ---------------------------------------------------------------- WhatsApp answers
// Meta error codes (https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes)
// final   = this guest can't get it (no point retrying);
// config  = our setup is wrong (token, template, account): stop the run, nobody else is tried;
// unclear = a WhatsApp server error (5xx): it may have been accepted anyway.
const FINAL_CODES = new Set([131026, 131021, 131030, 131009, 131051]);
const CONFIG_CODES = new Set([0, 3, 10, 100, 190, 368, 131005, 131008, 131031, 131042, 132000, 132001, 132005,
  132007, 132012, 132015, 132016, 132068, 132069, 133010]);

export function classifyError(httpStatus: number, code: number | null | undefined): ErrorKind {
  if (code != null && FINAL_CODES.has(code)) return 'final';
  if (code != null && (CONFIG_CODES.has(code) || (code >= 200 && code < 300))) return 'config';
  if (httpStatus === 401 || httpStatus === 403) return 'config';
  if (httpStatus >= 500) return 'unclear';
  return 'retry';
}

/** Turn the Cloud API's reply to a send into an outcome (error text is short and scrubbed). */
export function mapSendResponse(httpStatus: number, json: unknown): SendOutcome {
  const j = (json ?? {}) as { messages?: { id?: string }[]; error?: { code?: number; message?: string; error_data?: { details?: string } } };
  const id = j.messages?.[0]?.id;
  if (httpStatus >= 200 && httpStatus < 300 && id) return { ok: true, msgId: String(id) };
  const code = typeof j.error?.code === 'number' ? j.error.code : null;
  const kind = classifyError(httpStatus, code);
  const text = scrub(j.error?.message || j.error?.error_data?.details || 'http ' + httpStatus, 120);
  return { ok: false, kind, error: `${PREFIX[kind]}${code ?? httpStatus} ${text}`.trim() };
}

export interface StatusNews { id: string; status: 'sent' | 'delivered' | 'read' | 'failed'; error: string | null; guest: string | null; kind?: 'invite' }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The delivery news in a webhook post (entry[].changes[].value.statuses[]). Other news (incoming messages) is ignored.
 * guest = the guest id the sender put in biz_opaque_callback_data (null if absent or not an id).
 */
export function extractStatuses(payload: unknown): StatusNews[] {
  const out: StatusNews[] = [];
  const p = payload as { object?: string; entry?: { changes?: { field?: string; value?: { statuses?: unknown[] } }[] }[] };
  if (!p || !Array.isArray(p.entry)) return out;
  for (const e of p.entry) for (const ch of e?.changes ?? []) for (const s of (ch?.value?.statuses ?? []) as Record<string, unknown>[]) {
    const id = typeof s?.id === 'string' ? s.id : '';
    const st = String(s?.status ?? '');
    if (!id || !['sent', 'delivered', 'read', 'failed'].includes(st)) continue;
    let error: string | null = null;
    if (st === 'failed') {
      const er = (Array.isArray(s.errors) ? s.errors[0] : null) as { code?: number; title?: string; message?: string } | null;
      const code = typeof er?.code === 'number' ? er.code : null;
      const kind = classifyError(200, code);
      error = `${PREFIX[kind]}${code ?? ''} ${scrub(er?.title || er?.message || 'failed', 100)}`.trim();
    }
    // door pass: '<guest id>'; invite (send-invites): 'invite:<guest id>'
    const cb = typeof s?.biz_opaque_callback_data === 'string' ? s.biz_opaque_callback_data : '';
    const invite = cb.startsWith('invite:');
    const rawId = invite ? cb.slice(7) : cb;
    const g = UUID_RE.test(rawId) ? rawId.toLowerCase() : null;
    const item: StatusNews = { id, status: st as StatusNews['status'], error, guest: g };
    if (invite && g) item.kind = 'invite';
    out.push(item);
  }
  return out;
}

// ---------------------------------------------------------------- secrets
/** Compare two strings in constant time (for the same length). */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(String(a ?? '')), y = new TextEncoder().encode(String(b ?? ''));
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0 && x.length > 0;
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((v) => v.toString(16).padStart(2, '0')).join('');

/** HMAC-SHA256 of the raw body with the app secret, as hex. */
export async function hmacHex(raw: Uint8Array, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, raw));
}

/** Checks Meta's X-Hub-Signature-256 header ("sha256=<hex>") against the raw body. */
export async function verifySignature(raw: Uint8Array, header: string | null, secret: string | undefined): Promise<boolean> {
  if (!secret || !header || !header.startsWith('sha256=')) return false;
  return safeEqual(header.slice(7).toLowerCase(), await hmacHex(raw, secret));
}

// ---------------------------------------------------------------- the sender
export function readMode(v: string | undefined): Mode {
  const m = String(v ?? '').trim().toLowerCase();
  return m === 'live' || m === 'mock' ? m : 'off';
}

export type Sender = (body: Record<string, unknown>) => Promise<SendOutcome>;

/** Mock mode: no network, every message "goes through" with a made-up id. */
export const mockSender: Sender = async () => ({ ok: true, msgId: 'mock-' + crypto.randomUUID() });

/** Live mode: Meta WhatsApp Cloud API. */
export function liveSender(env: Env, fetchFn: typeof fetch, timeoutMs = 10000): Sender {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  return async (body) => {
    let res: Response;
    try {
      res = await fetchFn(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      // a timeout or a dropped connection: WhatsApp may have accepted it before we lost the answer
      return { ok: false, kind: 'unclear', error: 'unclear:network ' + scrub((e as Error)?.name || 'error', 40) };
    }
    let json: unknown = null;
    try { json = await res.json(); } catch { /* not JSON */ }
    return mapSendResponse(res.status, json);
  };
}

export interface SenderOptions extends TemplateOptions {
  mode: Mode;
  rpc: Rpc;
  send: Sender;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: Log;
  batch?: number;        // guests per claim
  claimFn?: string;      // database function that claims due guests (pass_send_claim)
  resultFn?: string;     // database function that records one result (pass_send_result)
  build?: (c: Claim, o: TemplateOptions) => { ok: true; body: Record<string, unknown> } | { ok: false; error: string };
  budgetMs?: number;     // stop claiming new batches after this long (50 s)
  hardMs?: number;       // give back what isn't sent yet after this long (110 s)
  ratePerSec?: number;   // messages per second (20)
  concurrency?: number;  // messages in flight at once (5)
}

export interface Summary {
  mode: Mode; claimed: number; sent: number; failed: number; released: number; batches: number;
  stopped: string | null; error: string | null; ms: number;
}

/** Claim due guests in batches and send each one its door pass, until none are due or time is up. */
export async function runSender(o: SenderOptions): Promise<Summary> {
  const now = o.now ?? Date.now, sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log: Log = o.log ?? (() => {});
  const batch = o.batch ?? 25, budget = o.budgetMs ?? 50000, hard = o.hardMs ?? 110000;
  const gap = 1000 / (o.ratePerSec ?? 20), conc = Math.max(1, o.concurrency ?? 5);
  const claimFn = o.claimFn ?? 'pass_send_claim', resultFn = o.resultFn ?? 'pass_send_result', build = o.build ?? buildPayload;
  const t0 = now();
  const sum: Summary = { mode: o.mode, claimed: 0, sent: 0, failed: 0, released: 0, batches: 0, stopped: null, error: null, ms: 0 };
  if (o.mode === 'off') { sum.ms = now() - t0; return sum; }

  // Saving a result is tried 3 times: a result that is lost leaves the guest 'sending', and after
  // 15 minutes that guest goes to the hosts' list (unless the webhook matches the message to them).
  const report = async (row: Claim, ok: boolean | null, msgId: string | null, error: string | null) => {
    for (let n = 1; ; n++) {
      let e: { message: string } | null;
      try { e = (await o.rpc(resultFn, { p_guest: row.guest_id, p_ok: ok, p_msg_id: msgId, p_error: error })).error; }
      catch (x) { e = { message: String((x as Error)?.message ?? x) }; }
      if (!e) return;
      if (n >= 3) { log('could not record the result', { guest: row.guest_id, ok, error: scrub(e.message) }); return; }
      await sleep(n === 1 ? 250 : 1000);
    }
  };

  // The run's first message goes alone, so a bad token or template costs one call to WhatsApp, not five.
  const first: { done: boolean; wait: Promise<void> | null } = { done: false, wait: null };
  let nextSlot = t0;
  while (now() - t0 < budget) {
    const { data, error } = await o.rpc(claimFn, { p_limit: batch });
    if (error) { sum.stopped = 'claim_error'; log('claim failed', { error: scrub(error.message) }); break; }
    const rows = (Array.isArray(data) ? data : []) as Claim[];
    if (!rows.length) break;
    sum.batches++; sum.claimed += rows.length;
    let i = 0;
    const state: { stop: string | null } = { stop: null };
    const worker = async () => {
      for (;;) {
        const row = rows[i++];
        if (!row) return;
        if (!first.done && first.wait) await first.wait;
        if (state.stop || now() - t0 > hard) { await report(row, null, null, null); sum.released++; continue; }
        const built = build(row, o);
        if (!built.ok) {
          await report(row, false, null, built.error); sum.failed++;
          log('not sent', { guest: row.guest_id, phone: maskPhone(row.phone), error: built.error });
          continue;
        }
        let open = () => {};
        const probe = !first.done;
        if (probe) first.wait = new Promise<void>((r) => { open = r; });
        const t = now(), slot = Math.max(nextSlot, t);
        nextSlot = slot + gap;
        if (slot > t) await sleep(slot - t);
        let out: SendOutcome;
        try { out = await o.send(built.body); } catch (e) { out = { ok: false, kind: 'unclear', error: 'unclear:send ' + scrub((e as Error)?.message, 60) }; }
        if (!out.ok && out.kind === 'config') { state.stop = 'config'; sum.error = out.error; }
        if (probe) { first.done = true; open(); }
        if (out.ok) {
          await report(row, true, out.msgId, null); sum.sent++;
          log('sent', { guest: row.guest_id, phone: maskPhone(row.phone) });
        } else {
          // a 'config:' error is saved without counting as one of the guest's 3 tries (see pass_send_result)
          await report(row, false, null, out.error); sum.failed++;
          log('failed', { guest: row.guest_id, phone: maskPhone(row.phone), kind: out.kind, error: out.error });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(conc, rows.length) }, worker));
    if (state.stop) { sum.stopped = state.stop; break; }
    if (now() - t0 > hard) { sum.stopped = 'time'; break; }
  }
  sum.ms = now() - t0;
  return sum;
}

// ---------------------------------------------------------------- HTTP handlers
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export interface SendDeps {
  rpc: Rpc;
  fetch?: typeof fetch;
  send?: Sender;          // tests only: replaces the mock/live sender
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: Log;
  batch?: number;
}

/**
 * send-door-passes. POST only, with header x-cron-secret = CRON_SECRET.
 * WHATSAPP_MODE: off (default; claims nothing) | mock (no network) | live (Meta Cloud API).
 */
export async function handleSendRequest(req: Request, env: Env, deps: SendDeps): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const secret = env.CRON_SECRET ?? '';
  if (secret.length < 16) return json({ error: 'not_configured' }, 500);
  if (!safeEqual(req.headers.get('x-cron-secret') ?? '', secret)) return json({ error: 'unauthorized' }, 401);
  const mode = readMode(env.WHATSAPP_MODE);
  if (mode === 'off') return json({ mode: 'off' });
  if (mode === 'live') {
    const missing = ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'].filter((k) => !env[k]);
    if (missing.length) return json({ error: 'missing_config', missing }, 500);
  }
  const send = deps.send ?? (mode === 'live' ? liveSender(env, deps.fetch ?? fetch) : mockSender);
  const summary = await runSender({
    mode, rpc: deps.rpc, send, now: deps.now, sleep: deps.sleep, log: deps.log, batch: deps.batch,
    template: env.WHATSAPP_TEMPLATE || DEFAULT_TEMPLATE,
    langAr: env.WHATSAPP_LANG_AR || 'ar',
    langEn: env.WHATSAPP_LANG_EN || 'en',
  });
  return json(summary, summary.stopped === 'claim_error' ? 500 : 200);
}

/**
 * whatsapp-webhook.
 * GET  = Meta checking the address: hub.mode=subscribe and hub.verify_token = WHATSAPP_VERIFY_TOKEN → echo hub.challenge.
 * POST = delivery news, signed with WHATSAPP_APP_SECRET (X-Hub-Signature-256) → pass_send_status_update for each status.
 */
export async function handleWebhookRequest(req: Request, env: Env, deps: { rpc: Rpc; log?: Log }): Promise<Response> {
  const log: Log = deps.log ?? (() => {});
  if (req.method === 'GET') {
    const u = new URL(req.url);
    const vt = env.WHATSAPP_VERIFY_TOKEN ?? '';
    if (u.searchParams.get('hub.mode') === 'subscribe' && vt && safeEqual(u.searchParams.get('hub.verify_token') ?? '', vt)) {
      return new Response(u.searchParams.get('hub.challenge') ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!env.WHATSAPP_APP_SECRET) return json({ error: 'not_configured' }, 500);
  const raw = new Uint8Array(await req.arrayBuffer());
  if (!(await verifySignature(raw, req.headers.get('x-hub-signature-256'), env.WHATSAPP_APP_SECRET))) {
    return json({ error: 'bad_signature' }, 401);
  }
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder().decode(raw)); } catch { return json({ error: 'bad_json' }, 400); }
  const news = extractStatuses(payload);
  let changed = 0, failed = 0;
  for (const n of news) {
    const args = { p_msg_id: n.id, p_status: n.status, p_error: n.error, p_guest: n.guest };
    let { data, error } = await deps.rpc(n.kind === 'invite' ? 'invite_send_status_update' : 'pass_send_status_update', args);
    // news with no guest id may be about an invite (send-invites): try that table too
    if (!error && !data && !n.kind && !n.guest) ({ data, error } = await deps.rpc('invite_send_status_update', args));
    if (error) { failed++; log('status update failed', { status: n.status, error: scrub(error.message) }); continue; }
    if (data) changed++;
  }
  // 500 makes Meta try again later (database trouble); anything else is done.
  return json({ ok: failed === 0, statuses: news.length, changed }, failed ? 500 : 200);
}
