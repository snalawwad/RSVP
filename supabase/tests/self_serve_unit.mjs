// Unit checks for functions/_shared/otp.ts, pay.ts and invites.ts (no database, no network).
// Run: node self_serve_unit.mjs   (Node 22.18+ reads .ts files directly)
import crypto from 'node:crypto';
import * as O from '../functions/_shared/otp.ts';
import * as Pay from '../functions/_shared/pay.ts';
import * as I from '../functions/_shared/invites.ts';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) { fails++; process.exitCode = 1; } };

// ---------- WhatsApp login code (auth-whatsapp-otp) ----------
const KEY = crypto.randomBytes(32);
const SECRET = 'v1,whsec_' + KEY.toString('base64');
const sign = (id, ts, body, key = KEY) => 'v1,' + crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
const NOW = 1_800_000_000_000;
const hookReq = ({ body, id = 'msg_1', ts = String(NOW / 1000), sig } = {}) => new Request('https://x.test/auth-whatsapp-otp', {
  method: 'POST', body, headers: { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': sig ?? sign(id, ts, body), 'content-type': 'application/json' },
});
const payload = JSON.stringify({ user: { id: 'u1', phone: '96599887766' }, sms: { otp: '482913' } });
const logs = []; const log = (m, f) => logs.push(m + JSON.stringify(f ?? {}));
const env = { SEND_SMS_HOOK_SECRET: SECRET };
const now = () => NOW;
const errOf = async (res) => (await res.json()).error;

ok(await O.signWebhook(SECRET, 'msg_1', '1', 'x') === sign('msg_1', '1', 'x').slice(3), 'otp: signature matches the standard-webhooks recipe');
ok(await O.verifyWebhook(new Headers({ 'webhook-id': 'a', 'webhook-timestamp': String(NOW / 1000), 'webhook-signature': 'v1,bogus ' + sign('a', String(NOW / 1000), 'b') }), 'b', SECRET, NOW), 'otp: one good signature among several is enough');
let res = await O.handleOtpHook(hookReq({ body: payload }), env, { log, now });
let e = await errOf(res);
ok(res.status === 503 && e.http_code === 503 && /not switched on/.test(e.message), 'otp: off (default) → 503 in Supabase\'s error shape, phone login stays off');
res = await O.handleOtpHook(hookReq({ body: payload, sig: sign('msg_1', String(NOW / 1000), payload, crypto.randomBytes(32)) }), { ...env, OTP_MODE: 'mock' }, { log, now });
ok(res.status === 401, 'otp: a wrong signature → 401');
res = await O.handleOtpHook(hookReq({ body: payload.replace('482913', '000000'), sig: sign('msg_1', String(NOW / 1000), payload) }), { ...env, OTP_MODE: 'mock' }, { log, now });
ok(res.status === 401, 'otp: a changed body → 401');
const old = String(NOW / 1000 - 600);
res = await O.handleOtpHook(hookReq({ body: payload, ts: old, sig: sign('msg_1', old, payload) }), { ...env, OTP_MODE: 'mock' }, { log, now });
ok(res.status === 401, 'otp: a request older than 5 minutes → 401');
res = await O.handleOtpHook(hookReq({ body: payload }), { OTP_MODE: 'mock' }, { log, now });
ok(res.status === 500, 'otp: no SEND_SMS_HOOK_SECRET → refuses');
res = await O.handleOtpHook(new Request('https://x.test', { method: 'GET' }), env, { log, now }); ok(res.status === 405, 'otp: GET → 405');
const bad = JSON.stringify({ user: { phone: '12' }, sms: { otp: '1' } });
res = await O.handleOtpHook(hookReq({ body: bad }), { ...env, OTP_MODE: 'mock' }, { log, now }); ok(res.status === 400, 'otp: a bad phone or code → 400');
res = await O.handleOtpHook(hookReq({ body: payload }), { ...env, OTP_MODE: 'mock' }, { log, now });
ok(res.status === 200 && (await res.text()) === '{}', 'otp: mock → 200 {} and sends nothing');
res = await O.handleOtpHook(hookReq({ body: payload }), { ...env, OTP_MODE: 'live' }, { log, now });
ok(res.status === 500, 'otp: live without WhatsApp settings → refuses');
const sent = [];
const fakeFetch = async (url, init) => { sent.push({ url, init }); return new Response(JSON.stringify({ messages: [{ id: 'wamid.X' }] }), { status: 200 }); };
const live = { ...env, OTP_MODE: 'live', WHATSAPP_TOKEN: 'tkn-secret-value', WHATSAPP_PHONE_NUMBER_ID: '1234567890' };
res = await O.handleOtpHook(hookReq({ body: payload }), live, { log, now, fetch: fakeFetch });
const b = JSON.parse(sent[0].init.body);
ok(res.status === 200 && sent[0].url.endsWith('/1234567890/messages') && sent[0].init.headers.Authorization === 'Bearer tkn-secret-value', 'otp: live → Meta Cloud API with the token');
ok(b.to === '96599887766' && b.template.name === 'sina_login_code' && b.template.language.code === 'ar'
  && b.template.components[0].parameters[0].text === '482913' && b.template.components[1].sub_type === 'url' && b.template.components[1].parameters[0].text === '482913',
  'otp: the authentication template carries the code in the body and the copy-code button');
res = await O.handleOtpHook(hookReq({ body: payload }), { ...live, WHATSAPP_OTP_TEMPLATE: 'other', WHATSAPP_OTP_LANG: 'en' }, { log, now, fetch: fakeFetch });
ok(JSON.parse(sent[1].init.body).template.name === 'other' && JSON.parse(sent[1].init.body).template.language.code === 'en', 'otp: template and language can be changed by secret');
res = await O.handleOtpHook(hookReq({ body: payload }), live, { log, now, fetch: async () => new Response(JSON.stringify({ error: { code: 131026, message: 'undeliverable' } }), { status: 400 }) });
ok(res.status === 400 && /can't get WhatsApp/.test((await errOf(res)).message), 'otp: a number not on WhatsApp → 400 with a clear message');
res = await O.handleOtpHook(hookReq({ body: payload }), live, { log, now, fetch: async () => { throw new TypeError('fetch failed'); } });
ok(res.status === 502, 'otp: network trouble → 502 (Supabase shows "try again")');
ok(logs.length >= 3 && !logs.some(l => l.includes('482913') || l.includes('96599887766') || l.includes('tkn-secret-value')), 'otp: logs never have the code, the full phone or the token');

// ---------- payments (pure parts) ----------
ok(Pay.readPayMode('test') === 'test' && Pay.readPayMode(' TEST ') === 'test' && Pay.readPayMode('live') === 'off' && Pay.readPayMode(undefined) === 'off', 'pay: PAYMENT_MODE is off unless "test"');
ok(Pay.bearer(new Request('https://x', { headers: { Authorization: 'Bearer abc' } })) === 'abc' && Pay.bearer(new Request('https://x')) === '', 'pay: reads the login token');
res = await Pay.handleCheckout(new Request('https://x', { method: 'OPTIONS' }), {}, { userRpc: async () => ({}), serviceRpc: async () => ({}) });
ok(res.status === 200 && res.headers.get('Access-Control-Allow-Origin') === '*', 'pay: answers the browser\'s CORS check');
const calls = [];
const deps = { userRpc: async (jwt, fn, a) => { calls.push(fn); return { data: { id: a.p_order, status: 'pending', amount_fils: 35000 }, error: null }; }, serviceRpc: async (fn) => { calls.push(fn); return { data: { status: 'paid' }, error: null }; } };
const oid = crypto.randomUUID();
res = await Pay.handleCheckoutTest(new Request('https://x', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify({ order_id: oid, outcome: 'paid' }) }), { PAYMENT_MODE: 'off' }, deps);
ok(res.status === 403 && calls.length === 0, 'checkout-test: off → refuses before touching the database');
res = await Pay.handleCheckoutTest(new Request('https://x', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify({ order_id: oid, outcome: 'paid' }) }), { PAYMENT_MODE: 'test' }, deps);
ok(res.status === 200 && calls.join() === 'order_status_v2,_v2_mark_paid', 'checkout-test: checks the order as the host, then marks it paid as the server');

// ---------- invites ----------
const claim = { guest_id: '6f9619ff-8b86-d011-b42d-00c04fc964ff', event_id: 'e', phone: '50001234', name: 'Noura', people: 1, token: 'a'.repeat(36), lang: 'en', event_title: 'Wedding', starts_at: '2026-12-18T16:00:00Z', venue: null };
const built = I.buildInvitePayload(claim, { template: 'sina_invite', langAr: 'ar', langEn: 'en' });
ok(built.ok && built.body.biz_opaque_callback_data === 'invite:' + claim.guest_id && built.body.to === '96550001234' && built.body.template.name === 'sina_invite', 'invites: the message is tagged invite:<guest id> for the webhook');
const P = await import('../functions/_shared/pass.ts');
const st = P.extractStatuses({ entry: [{ changes: [{ value: { statuses: [{ id: 'w1', status: 'read', biz_opaque_callback_data: 'invite:' + claim.guest_id }, { id: 'w2', status: 'read', biz_opaque_callback_data: 'invite:nope' }] } }] }] });
ok(st[0].kind === 'invite' && st[0].guest === claim.guest_id && !st[1].kind && st[1].guest === null, 'webhook: invite news is recognised; a bad tag is ignored');
const wc = [];
const SEC = 'app-secret';
const body = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'w1', status: 'read', biz_opaque_callback_data: 'invite:' + claim.guest_id }, { id: 'w3', status: 'delivered' }, { id: 'w4', status: 'delivered', biz_opaque_callback_data: claim.guest_id }] } }] }] });
const sig = 'sha256=' + crypto.createHmac('sha256', SEC).update(body).digest('hex');
res = await P.handleWebhookRequest(new Request('https://x', { method: 'POST', body, headers: { 'x-hub-signature-256': sig } }), { WHATSAPP_APP_SECRET: SEC }, { rpc: async (fn, a) => { wc.push(fn + ':' + a.p_msg_id); return { data: null, error: null }; } });
ok(wc.join() === 'invite_send_status_update:w1,pass_send_status_update:w3,invite_send_status_update:w3,pass_send_status_update:w4',
  `webhook: tagged invites go to invites; untagged news tries passes then invites; door-pass news with a guest id stays with passes (${wc.join()})`);
res = await I.handleInvitesRequest(new Request('https://x', { method: 'POST', headers: { 'x-cron-secret': 'c'.repeat(20) } }), { CRON_SECRET: 'c'.repeat(20), INVITES_MODE: 'live' }, { rpc: async () => ({ data: [], error: null }) });
ok(res.status === 500 && (await res.json()).error === 'missing_config', 'send-invites: live without WhatsApp settings → refuses');

console.log(fails ? `${fails} FAILED` : 'all self-serve function checks passed');
