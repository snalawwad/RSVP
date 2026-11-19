// Unit checks for supabase/functions/_shared/pass.ts (no database, no network).
// Run: node pass_unit.mjs   (Node 22.18+ reads .ts files directly)
import crypto from 'node:crypto';
import * as P from '../functions/_shared/pass.ts';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) { fails++; process.exitCode = 1; } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- phones ----------
const phones = [
  ['50001234', '96550001234'], ['5000 1234', '96550001234'], ['+965 5000 1234', '96550001234'], ['0096550001234', '96550001234'],
  ['٥٠٠٠١٢٣٤', '96550001234'], ['۶۰۰۰۱۲۳۴', '96560001234'], ['965-9000-0001', '96590000001'], ['+44 7700 900123', '447700900123'],
  ['966501234567', '966501234567'], [null, null], ['', null], ['123', null], ['9655000123', null], ['965500012345', null],
  ['0501234567', null], ['1234567890123456', null],
];
for (const [i, o] of phones) ok(P.normalizePhone(i) === o, `normalizePhone(${JSON.stringify(i)}) → ${o} (got ${P.normalizePhone(i)})`);
ok(P.maskPhone('96550001234') === '+965•••••234', 'maskPhone keeps the country code and last 3 digits');
ok(!P.maskPhone('96550001234').includes('5000') && P.maskPhone(null) === '(none)', 'maskPhone hides the middle; empty → (none)');
ok(P.maskToken('abcdef0123456789abcdef0123456789abcd') === 'abcd…(36)' && P.maskToken('') === '(none)', 'maskToken shows 4 characters and the length');
ok(P.scrub('Recipient +965 5000 1234 / 96550001234 token abcdef0123456789abcdef0123') === 'Recipient … / … token …', `scrub hides phones and tokens (${P.scrub('Recipient +965 5000 1234 / 96550001234 token abcdef0123456789abcdef0123')})`);
ok(P.scrub('error 131026') === 'error 131026', 'scrub keeps 6-digit WhatsApp error codes');

// ---------- dates in Kuwait ----------
const f = (iso, l) => P.formatWhen(iso, l);
ok(f('2026-12-18T16:00:00Z', 'en') === 'Friday 18 December at 7:00 PM', `English date and time in Kuwait (${f('2026-12-18T16:00:00Z', 'en')})`);
ok(f('2026-12-18T16:00:00Z', 'ar') === 'الجمعة، ١٨ ديسمبر الساعة ٧:٠٠ م', `Arabic date and time in Kuwait, Arabic digits (${f('2026-12-18T16:00:00Z', 'ar')})`);
ok(f('2026-12-17T21:30:00Z', 'en') === 'Friday 18 December at 12:30 AM', `just after midnight in Kuwait is the next day (${f('2026-12-17T21:30:00Z', 'en')})`);
ok(f('2026-12-17T21:30:00Z', 'ar').startsWith('الجمعة، ١٨ ديسمبر') && f('2026-12-17T21:30:00Z', 'ar').endsWith('ص'), `Arabic after midnight: next day, ص (${f('2026-12-17T21:30:00Z', 'ar')})`);
ok(f('2027-03-05T09:15:00+03:00', 'en') === 'Friday 5 March at 9:15 AM', `morning event (${f('2027-03-05T09:15:00+03:00', 'en')})`);
ok(f(null, 'en') === 'the day of the event' && f('nope', 'ar') === 'يوم المناسبة', 'no date: a plain fallback, never "Invalid Date"');
ok(!/[  ]/.test(f('2026-12-18T16:00:00Z', 'en') + f('2026-12-18T16:00:00Z', 'ar')), 'no hidden no-break spaces');
ok(f('2026-12-18T16:00:00Z', 'ar') === f('2026-12-18T16:00:00Z', 'xx'), 'any language other than en is Arabic (the event default)');

// ---------- message body ----------
ok(P.cleanParam('  Noura\n\tAl  Sabah     x ', 80) === 'Noura Al Sabah x', 'cleanParam: no new lines, tabs or runs of spaces');
ok(P.cleanParam('a'.repeat(100), 60).length === 60, 'cleanParam: length limit');
const TOK = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8';
const claim = { guest_id: 'g1', event_id: 'e1', phone: '50001234', name: 'Noura\nAl Sabah', people: 2, token: TOK, lang: 'en', event_title: 'Sara & Fahad', starts_at: '2026-12-18T16:00:00Z', venue: 'Hall' };
const opt = { template: 'sina_door_pass', langAr: 'ar', langEn: 'en' };
let b = P.buildPayload(claim, opt);
ok(b.ok && eq(b.body, {
  messaging_product: 'whatsapp', recipient_type: 'individual', to: '96550001234', biz_opaque_callback_data: 'g1', type: 'template',
  template: { name: 'sina_door_pass', language: { code: 'en' }, components: [
    { type: 'body', parameters: [{ type: 'text', text: 'Noura Al Sabah' }, { type: 'text', text: 'Sara & Fahad' }, { type: 'text', text: 'Friday 18 December at 7:00 PM' }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: TOK }] }] },
}), 'English template payload: to, guest id for the webhook, template name, language, 3 body values, URL button with the invite token');
b = P.buildPayload({ ...claim, lang: 'ar', name: '', event_title: null }, { ...opt, langAr: 'ar_KW' });
ok(b.ok && b.body.template.language.code === 'ar_KW' && b.body.template.components[0].parameters.map(p => p.text).join('|') === 'ضيفنا|المناسبة|الجمعة، ١٨ ديسمبر الساعة ٧:٠٠ م', 'Arabic payload: language code from settings, fallbacks for an empty name and title');
ok(eq(P.buildPayload({ ...claim, phone: '123' }, opt), { ok: false, error: 'final:bad_phone' }), 'a bad phone is a final error (no retry)');
ok(eq(P.buildPayload({ ...claim, token: 'short' }, opt), { ok: false, error: 'final:bad_token' }) && !P.buildPayload({ ...claim, token: 'x?t=../' + TOK }, opt).ok, 'a bad token is a final error');
ok(!JSON.stringify(P.buildPayload(claim, opt)).includes('http'), 'the payload carries no link (the template holds the address)');

// ---------- WhatsApp answers ----------
ok(eq(P.mapSendResponse(200, { messaging_product: 'whatsapp', contacts: [{ input: '96550001234', wa_id: '96550001234' }], messages: [{ id: 'wamid.HBgM' }] }), { ok: true, msgId: 'wamid.HBgM' }), 'accepted → ok with the message id');
let m = P.mapSendResponse(400, { error: { code: 131026, message: 'Message undeliverable to 96550001234' } });
ok(!m.ok && m.kind === 'final' && m.error.startsWith('final:131026') && !m.error.includes('96550001234'), `not on WhatsApp → final, phone scrubbed (${m.error})`);
m = P.mapSendResponse(401, { error: { code: 190, message: 'Error validating access token' } }); ok(!m.ok && m.kind === 'config' && m.error.startsWith('config:190'), 'bad token → config (stop the run)');
m = P.mapSendResponse(404, { error: { code: 132001, message: 'Template name does not exist in the translation' } }); ok(!m.ok && m.kind === 'config', 'missing template → config');
m = P.mapSendResponse(429, { error: { code: 130429, message: 'Rate limit hit' } }); ok(!m.ok && m.kind === 'retry' && m.error.startsWith('130429'), 'rate limit → retry later');
m = P.mapSendResponse(502, null); ok(!m.ok && m.kind === 'unclear' && m.error === 'unclear:502 http 502', 'server error without JSON → unclear (may have gone; no blind retry)');
m = P.mapSendResponse(500, { error: { code: 131000, message: 'Something went wrong' } }); ok(!m.ok && m.kind === 'unclear' && m.error.startsWith('unclear:131000'), 'WhatsApp 500 "something went wrong" → unclear');
m = P.mapSendResponse(400, { error: { code: 131000, message: 'Something went wrong' } }); ok(!m.ok && m.kind === 'retry', 'a 4xx WhatsApp refused → retry later');
m = P.mapSendResponse(200, {}); ok(!m.ok && m.kind === 'retry', '200 without a message id is not counted as sent');

// ---------- webhook ----------
const hook = { object: 'whatsapp_business_account', entry: [{ id: 'WABA', changes: [
  { field: 'messages', value: { messaging_product: 'whatsapp', statuses: [
    { id: 'wamid.1', status: 'sent', timestamp: '1', recipient_id: '96550001234' },
    { id: 'wamid.2', status: 'delivered' }, { id: 'wamid.3', status: 'read' },
    { id: 'wamid.4', status: 'failed', errors: [{ code: 131026, title: 'Message undeliverable' }] },
    { id: 'wamid.5', status: 'failed', errors: [{ code: 131000, title: 'Something went wrong' }] },
    { id: 'wamid.6', status: 'deleted' }, { status: 'read' },
    { id: 'wamid.7', status: 'sent', biz_opaque_callback_data: '6F9619FF-8B86-D011-B42D-00C04FC964FF' }, { id: 'wamid.8', status: 'read', biz_opaque_callback_data: "x'); drop" }] } },
  { field: 'messages', value: { messages: [{ from: '96550001234', text: { body: 'thanks' } }] } }] }] };
const st = P.extractStatuses(hook);
ok(eq(st, [{ id: 'wamid.1', status: 'sent', error: null, guest: null }, { id: 'wamid.2', status: 'delivered', error: null, guest: null }, { id: 'wamid.3', status: 'read', error: null, guest: null },
  { id: 'wamid.4', status: 'failed', error: 'final:131026 Message undeliverable', guest: null }, { id: 'wamid.5', status: 'failed', error: '131000 Something went wrong', guest: null },
  { id: 'wamid.7', status: 'sent', error: null, guest: '6f9619ff-8b86-d011-b42d-00c04fc964ff' }, { id: 'wamid.8', status: 'read', error: null, guest: null }]),
  'webhook statuses: sent/delivered/read/failed kept, others and incoming messages ignored, failure kind marked, guest id read back (ids only)');
ok(eq(P.extractStatuses(null), []) && eq(P.extractStatuses({ entry: 'x' }), []), 'odd webhook bodies give nothing');

// ---------- secrets ----------
ok(P.safeEqual('abc123', 'abc123') && !P.safeEqual('abc123', 'abc124') && !P.safeEqual('abc', 'abc123') && !P.safeEqual('', ''), 'safeEqual: same / different / other length / empty');
const raw = new TextEncoder().encode(JSON.stringify(hook)), SEC = 'app-secret';
const good = 'sha256=' + crypto.createHmac('sha256', SEC).update(raw).digest('hex');
ok(await P.verifySignature(raw, good, SEC), 'signature: Meta\'s HMAC-SHA256 accepted');
ok(await P.verifySignature(raw, good.toUpperCase().replace('SHA256=', 'sha256='), SEC), 'signature: upper-case hex accepted');
ok(!(await P.verifySignature(new TextEncoder().encode(JSON.stringify(hook) + ' '), good, SEC)), 'signature: a changed body is refused');
ok(!(await P.verifySignature(raw, good.slice(7), SEC)) && !(await P.verifySignature(raw, good, '')) && !(await P.verifySignature(raw, null, SEC)), 'signature: no prefix / no secret / no header refused');
ok(P.readMode(undefined) === 'off' && P.readMode(' LIVE ') === 'live' && P.readMode('mock') === 'mock' && P.readMode('yes') === 'off', 'mode: off unless mock or live');

// ---------- the send handler with fakes (no database, no network) ----------
const SECRET = 'cron-secret-0123456789abcdef';
const req = (method = 'POST', secret = SECRET) => new Request('https://x.test/send', { method, headers: secret ? { 'x-cron-secret': secret } : {}, body: method === 'POST' ? '{}' : undefined });
const fakeDb = (rows, batches = 1) => {
  const calls = [], queue = []; for (let i = 0; i < batches; i++) queue.push(rows.slice(i * Math.ceil(rows.length / batches), (i + 1) * Math.ceil(rows.length / batches)));
  return { calls, rpc: async (fn, args) => { calls.push([fn, args]); return fn === 'pass_send_claim' ? { data: queue.shift() || [], error: null } : { data: 'ok', error: null }; } };
};
const rowsOf = n => Array.from({ length: n }, (_, i) => ({ ...claim, guest_id: 'g' + i, phone: '9655' + String(i).padStart(7, '0') }));
let db = fakeDb(rowsOf(2)), res;
res = await P.handleSendRequest(req('GET'), { CRON_SECRET: SECRET, WHATSAPP_MODE: 'mock' }, { rpc: db.rpc }); ok(res.status === 405 && db.calls.length === 0, 'send: GET refused');
res = await P.handleSendRequest(req('POST', null), { CRON_SECRET: SECRET, WHATSAPP_MODE: 'mock' }, { rpc: db.rpc }); ok(res.status === 401 && db.calls.length === 0, 'send: no secret header refused');
res = await P.handleSendRequest(req(), { WHATSAPP_MODE: 'mock' }, { rpc: db.rpc }); ok(res.status === 500 && (await res.json()).error === 'not_configured' && db.calls.length === 0, 'send: no CRON_SECRET set → refuses everything');
res = await P.handleSendRequest(req(), { CRON_SECRET: 'short', WHATSAPP_MODE: 'mock' }, { rpc: db.rpc }); ok(res.status === 500 && db.calls.length === 0, 'send: a short CRON_SECRET is not accepted');
res = await P.handleSendRequest(req(), { CRON_SECRET: SECRET }, { rpc: db.rpc }); ok(res.status === 200 && eq(await res.json(), { mode: 'off' }) && db.calls.length === 0, 'send: mode off → {mode:"off"}, claims nothing');
// live, with a fake fetch standing in for Meta
const seen = [];
const fakeFetch = async (url, init) => { seen.push({ url, init }); return new Response(JSON.stringify({ messages: [{ id: 'wamid.' + seen.length }] }), { status: 200 }); };
db = fakeDb(rowsOf(3));
res = await P.handleSendRequest(req(), { CRON_SECRET: SECRET, WHATSAPP_MODE: 'live', WHATSAPP_TOKEN: 'tkn', WHATSAPP_PHONE_NUMBER_ID: '1234567890' }, { rpc: db.rpc, fetch: fakeFetch, sleep: async () => {} });
let sum = await res.json();
ok(res.status === 200 && sum.mode === 'live' && sum.claimed === 3 && sum.sent === 3, 'send live (fake Meta): 3 claimed, 3 sent');
ok(seen.every(s => s.url === 'https://graph.facebook.com/v21.0/1234567890/messages' && s.init.method === 'POST' && s.init.headers.Authorization === 'Bearer tkn'), 'send live: posts to the Graph API messages address with the bearer token');
ok(JSON.parse(seen[0].init.body).template.name === 'sina_door_pass', 'send live: default template name sina_door_pass');
ok(eq(db.calls.filter(c => c[0] === 'pass_send_result').map(c => c[1]), rowsOf(3).map((r, i) => ({ p_guest: r.guest_id, p_ok: true, p_msg_id: 'wamid.' + (i + 1), p_error: null }))), 'send live: each result is reported with its message id');
// a setup error stops the run and gives the rest back
db = fakeDb(rowsOf(6));
const bad = async () => new Response(JSON.stringify({ error: { code: 190, message: 'Error validating access token' } }), { status: 401 });
res = await P.handleSendRequest(req(), { CRON_SECRET: SECRET, WHATSAPP_MODE: 'live', WHATSAPP_TOKEN: 'x', WHATSAPP_PHONE_NUMBER_ID: '1', WHATSAPP_TEMPLATE: 'other' }, { rpc: db.rpc, fetch: bad, sleep: async () => {} });
sum = await res.json();
const results = db.calls.filter(c => c[0] === 'pass_send_result').map(c => c[1]);
ok(sum.stopped === 'config' && sum.failed >= 1 && sum.failed + sum.released === 6 && results.filter(r => r.p_ok === null).length === sum.released && sum.released >= 1, `send: a token/template problem stops the run and gives the rest back (${JSON.stringify(sum)})`);
ok(db.calls.filter(c => c[0] === 'pass_send_claim').length === 1, 'send: no new batch after a setup problem');
ok(sum.error && sum.error.startsWith('config:190') && results.filter(r => r.p_ok === false).every(r => r.p_error.startsWith('config:')), 'send: the setup error is in the run summary and reported as config: (the try doesn\'t count)');
// with 5 in flight and a slow answer, a bad token still costs one call to WhatsApp (the run's first message goes alone)
{
  let calls = 0; const slow = async () => { calls++; await new Promise(r => setTimeout(r, 60)); return new Response(JSON.stringify({ error: { code: 190, message: 'Error validating access token' } }), { status: 401 }); };
  const d2 = fakeDb(rowsOf(25));
  const r2 = await P.handleSendRequest(req(), { CRON_SECRET: SECRET, WHATSAPP_MODE: 'live', WHATSAPP_TOKEN: 'x', WHATSAPP_PHONE_NUMBER_ID: '1' }, { rpc: d2.rpc, fetch: slow, sleep: async () => {} });
  const s2 = await r2.json(), res2 = d2.calls.filter(c => c[0] === 'pass_send_result').map(c => c[1]);
  ok(calls === 1 && s2.failed === 1 && s2.released === 24 && res2.filter(r => r.p_ok === null).length === 24, `send: a bad token costs one call, the other 24 are given back untouched (${calls} calls, ${JSON.stringify(s2)})`);
  // and once the first message goes through, the rest go 5 at a time
  let inFlight = 0, peak = 0; const d3 = fakeDb(rowsOf(20));
  const okSlow = async () => { inFlight++; peak = Math.max(peak, inFlight); await new Promise(r => setTimeout(r, 20)); inFlight--; return new Response(JSON.stringify({ messages: [{ id: 'wamid.x' + Math.random() }] }), { status: 200 }); };
  await P.handleSendRequest(req(), { CRON_SECRET: SECRET, WHATSAPP_MODE: 'live', WHATSAPP_TOKEN: 'x', WHATSAPP_PHONE_NUMBER_ID: '1' }, { rpc: d3.rpc, fetch: okSlow, sleep: async () => {} });
  ok(peak === 5 && d3.calls.filter(c => c[0] === 'pass_send_result' && c[1].p_ok).length === 20, `send: after the first message, 5 in flight (peak ${peak})`);
}
// a network error is retried later
db = fakeDb(rowsOf(1));
res = await P.handleSendRequest(req(), { CRON_SECRET: SECRET, WHATSAPP_MODE: 'live', WHATSAPP_TOKEN: 'x', WHATSAPP_PHONE_NUMBER_ID: '1' }, { rpc: db.rpc, fetch: async () => { throw new TypeError('fetch failed'); }, sleep: async () => {} });
ok(db.calls.find(c => c[0] === 'pass_send_result')[1].p_error === 'unclear:network TypeError', 'send: a network error is recorded as unclear (it may have gone; not sent again blind)');
{
  const keep = setTimeout(() => {}, 5000);   // AbortSignal.timeout doesn't keep Node running on its own
  const hang = async (u, i) => new Promise((r, j) => i.signal.addEventListener('abort', () => j(i.signal.reason)));
  const out = await P.liveSender({ WHATSAPP_TOKEN: 'x', WHATSAPP_PHONE_NUMBER_ID: '1' }, hang, 50)(P.buildPayload(claim, opt).body);
  clearTimeout(keep);
  ok(!out.ok && out.kind === 'unclear' && out.error === 'unclear:network TimeoutError', `send: a timeout is unclear too (${out.error})`);
}
// a result that doesn't save is tried again, 3 times in all
{
  let tries = 0; const waits = [];
  const flaky = async (fn, a) => { if (fn === 'pass_send_claim') return { data: tries ? [] : rowsOf(1), error: null }; tries++; return tries < 3 ? { data: null, error: { message: 'timeout' } } : { data: 'sent', error: null }; };
  let claimed = false;
  const s3 = await P.runSender({ ...opt, mode: 'mock', send: P.mockSender, sleep: async ms => { waits.push(ms); }, rpc: async (fn, a) => { if (fn === 'pass_send_claim') { if (claimed) return { data: [], error: null }; claimed = true; return { data: rowsOf(1), error: null }; } return flaky(fn, a); } });
  ok(tries === 3 && s3.sent === 1 && waits.includes(250) && waits.includes(1000), `saving a result: retried after 250 ms and 1 s (${tries} tries, waits ${waits})`);
  const lg = []; let t2 = 0; claimed = false;
  await P.runSender({ ...opt, mode: 'mock', send: P.mockSender, sleep: async () => {}, log: (m) => lg.push(m), rpc: async fn => { if (fn === 'pass_send_claim') { if (claimed) return { data: [], error: null }; claimed = true; return { data: rowsOf(1), error: null }; } t2++; throw new Error('db down'); } });
  ok(t2 === 3 && lg.includes('could not record the result'), 'saving a result: gives up after 3 tries and logs it (no crash)');
}

// pacing and time limits (fake clock)
let clock = 0; const now = () => clock, sleep = async ms => { clock += ms; };
db = fakeDb(rowsOf(60), 3);
sum = await P.runSender({ ...opt, mode: 'mock', rpc: db.rpc, send: P.mockSender, now, sleep, batch: 20 });
ok(sum.sent === 60 && sum.batches === 3 && clock >= 2900 && clock <= 3100, `about 20 messages a second (60 in ${clock} ms)`);
clock = 0; db = fakeDb(rowsOf(30), 1);
sum = await P.runSender({ ...opt, mode: 'mock', rpc: db.rpc, now, sleep, concurrency: 1, hardMs: 500, send: async () => { clock += 100; return { ok: true, msgId: 'm' }; } });
ok(sum.stopped === 'time' && sum.sent > 0 && sum.released > 0 && sum.sent + sum.released === 30, `past the time limit the rest is given back (${sum.sent} sent, ${sum.released} given back)`);
clock = 0; let claims = 0;
sum = await P.runSender({ ...opt, mode: 'mock', now, sleep, budgetMs: 1000, rpc: async fn => { if (fn === 'pass_send_claim') { claims++; clock += 600; return { data: rowsOf(1), error: null }; } return { data: 'ok', error: null }; }, send: P.mockSender });
ok(claims === 2, `no new batch is claimed after the 50 s budget (${claims} claims with a 1 s budget)`);
sum = await P.runSender({ ...opt, mode: 'mock', rpc: async () => ({ data: null, error: { message: 'db down' } }), send: P.mockSender });
ok(sum.stopped === 'claim_error' && sum.claimed === 0, 'a database error stops the run');
// logs never carry full phones or tokens
const logs = []; db = fakeDb(rowsOf(2));
await P.runSender({ ...opt, mode: 'mock', rpc: db.rpc, send: async () => ({ ok: false, kind: 'retry', error: '131000 x' }), sleep: async () => {}, log: (m, x) => logs.push(m + JSON.stringify(x)) });
ok(logs.length === 2 && !logs.some(l => l.includes(TOK) || /9655\d{7}/.test(l)), 'logs have masked phones and no tokens');

// ---------- the webhook handler with fakes ----------
const wcalls = []; const wrpc = async (fn, a) => { wcalls.push(a); return { data: 'delivered', error: null }; };
const env = { WHATSAPP_VERIFY_TOKEN: 'verify-me', WHATSAPP_APP_SECRET: SEC };
res = await P.handleWebhookRequest(new Request('https://x.test/hook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345'), env, { rpc: wrpc });
ok(res.status === 200 && (await res.text()) === '12345', 'webhook GET: right verify token → echoes the challenge');
res = await P.handleWebhookRequest(new Request('https://x.test/hook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=12345'), env, { rpc: wrpc });
ok(res.status === 403, 'webhook GET: wrong verify token → 403');
res = await P.handleWebhookRequest(new Request('https://x.test/hook?hub.mode=subscribe&hub.verify_token=&hub.challenge=1'), { WHATSAPP_APP_SECRET: SEC }, { rpc: wrpc });
ok(res.status === 403, 'webhook GET: no verify token set → 403');
res = await P.handleWebhookRequest(new Request('https://x.test/hook', { method: 'POST', body: raw, headers: { 'x-hub-signature-256': 'sha256=00' } }), env, { rpc: wrpc });
ok(res.status === 401 && wcalls.length === 0, 'webhook POST: bad signature → 401, nothing changed');
res = await P.handleWebhookRequest(new Request('https://x.test/hook', { method: 'POST', body: raw, headers: { 'x-hub-signature-256': good } }), env, { rpc: wrpc });
const wj = await res.json();
ok(res.status === 200 && wj.statuses === 7 && wcalls.length === 7 && eq(wcalls[3], { p_msg_id: 'wamid.4', p_status: 'failed', p_error: 'final:131026 Message undeliverable', p_guest: null })
  && wcalls[5].p_guest === '6f9619ff-8b86-d011-b42d-00c04fc964ff', 'webhook POST: signed → one status update per status, with the guest id when WhatsApp sends it back');
res = await P.handleWebhookRequest(new Request('https://x.test/hook', { method: 'POST', body: raw, headers: { 'x-hub-signature-256': good } }), env, { rpc: async () => ({ data: null, error: { message: 'down' } }) });
ok(res.status === 500, 'webhook POST: database trouble → 500 so Meta tries again');
res = await P.handleWebhookRequest(new Request('https://x.test/hook', { method: 'POST', body: raw, headers: { 'x-hub-signature-256': good } }), { WHATSAPP_VERIFY_TOKEN: 'v' }, { rpc: wrpc });
ok(res.status === 500, 'webhook POST: no app secret set → refuses');

console.log(fails ? `${fails} FAILED` : 'all pass.ts checks passed');
