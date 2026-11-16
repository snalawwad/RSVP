// Checks for supabase/migrations/0006_pass_sending.sql (door passes on WhatsApp) and for the
// send-door-passes / whatsapp-webhook logic in functions/_shared/pass.ts, run against the
// throwaway Postgres in mock/off mode. Never touches Supabase or Meta.
const { Pool } = require('pg');
const crypto = require('crypto');

module.exports = async function passSending({ c, ok, as, repo }) {
  const q = async (sql, p) => (await c.query(sql, p)).rows;
  const who = email => ({ sub: crypto.randomUUID(), email, role: 'authenticated' });
  const svc = (sql, p) => as('service_role', {}, sql, p);
  const claim = async (n = 100) => (await svc(`select * from public.pass_send_claim($1)`, [n])).rows;
  const result = async (g, okv, id, err) => (await svc(`select public.pass_send_result($1,$2,$3,$4) r`, [g, okv, id, err])).rows[0].r;
  const news = async (id, st, err, g = null) => (await svc(`select public.pass_send_status_update($1,$2,$3,$4) r`, [id, st, err, g])).rows[0].r;
  const row = async g => (await q(`select * from public.pass_sends where guest_id = $1`, [g]))[0];
  const ago = (g, mins) => q(`update public.pass_sends set updated_at = now() - make_interval(mins => $2) where guest_id = $1`, [g, mins]);
  const denied = p => p.then(() => false, e => /permission denied|Not allowed|row-level security/.test(e.message));
  let r, j;

  // nothing else in the database sends automatically while these checks run
  ok((await q(`select count(*)::int n from public.events where pass_auto_send`))[0].n === 0, '[send] every event starts with automatic sending off');

  // ---------- 1. when the pass is released ----------
  const relOf = async (starts, at = null) => {
    const [e] = await q(`insert into public.events(title, starts_at, pass_release_at) values ('rel', $1, $2) returning id`, [starts, at]);
    const [x] = await q(`select (public._v2_pass_release(e) at time zone 'Asia/Kuwait')::text t from public.events e where id = $1`, [e.id]);
    await q(`delete from public.events where id = $1`, [e.id]);
    return x.t;
  };
  ok(await relOf('2026-12-18T19:00:00+03:00') === '2026-12-17 16:00:00', '[release] default: the day before at 16:00 Kuwait');
  ok(await relOf('2026-12-18T00:30:00+03:00') === '2026-12-17 16:00:00', '[release] an event just after midnight: still 16:00 the (Kuwait) day before');
  ok(await relOf('2026-12-17T21:30:00Z') === '2026-12-17 16:00:00', '[release] counted in Kuwait time, not UTC (21:30 UTC = 00:30 next day in Kuwait)');
  ok(await relOf('2026-12-18T23:59:00+03:00') === '2026-12-17 16:00:00', '[release] an event late at night: 16:00 the day before');
  ok(await relOf('2026-12-18T19:00:00+03:00', '2026-12-10T09:00:00+03:00') === '2026-12-10 09:00:00', '[release] a set release time wins');
  ok(await relOf(null) === null, '[release] no date and no release time: not released');
  ok(await relOf(null, '2026-12-10T09:00:00+03:00') === '2026-12-10 09:00:00', '[release] no date but a release time: that time');

  // ---------- people and events ----------
  await q(`insert into public.admin_emails values ('padmin@test.local') on conflict do nothing`);
  const ev = async (title, extra = {}) => {
    const f = { title, lang: 'ar', venue: 'Hall', ...extra }, cols = Object.keys(f);
    return (await q(`insert into public.events(${cols.join(',')}) values (${cols.map((_, i) => '$' + (i + 1)).join(',')}) returning *`, Object.values(f)))[0];
  };
  const guest = async (e, name, phone, status = 'yes', seats = 1, side = null) => (await q(
    `insert into public.guests(event_id,name,phone,seats,status,confirmed_count,side) values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [e, name, phone, seats, status, status === 'yes' ? seats : status === 'no' ? 0 : null, side]))[0];
  const member = (e, email, role, side = null) => q(`insert into public.event_members(event_id,email,role,side) values ($1,$2,$3,$4)`, [e, email, role, side]);

  // ---------- 2. the invite shows the pass only once released ----------
  const F = await ev('Future party', { starts_at: new Date(Date.now() + 5 * 864e5).toISOString() });
  const fy = await guest(F.id, 'Future Yes', '96551000001', 'yes', 2), fp = await guest(F.id, 'Future Pending', '96551000002', 'pending');
  const inv = async t => (await as('anon', {}, `select public.get_invite_v2($1) j`, [t])).rows[0].j;
  const [fRel] = await q(`select public._v2_pass_release(e) t from public.events e where id = $1`, [F.id]);
  j = await inv(fy.token);
  ok(j.status === 'yes' && j.pass === null && j.pass_at && Date.parse(j.pass_at) === fRel.t.getTime(), '[invite] before release: no pass, pass_at = release time');
  ok(new Date(j.pass_at) > new Date(), '[invite] pass_at is in the future');
  j = await inv(fp.token); ok(j.pass === null && j.pass_at === null, '[invite] pending guest: no pass, no pass_at');
  j = (await as('anon', {}, `select public.respond_v2($1,'yes',1,null) j`, [fp.token])).rows[0].j;
  ok(j.pass === null && j.pass_at, '[invite] replying yes before release: no pass yet, pass_at given');
  await q(`update public.events set pass_release_at = now() where id = $1`, [F.id]);
  j = await inv(fy.token);
  ok(j.pass && /^[A-Za-z0-9_-]{32}$/.test(j.pass.key) && j.pass.code === fy.pass_code && Date.parse(j.pass_at) <= Date.now(), '[invite] admin releases now: the pass shows');
  j = (await as('anon', {}, `select public.respond_v2($1,'no',null,null) j`, [fy.token])).rows[0].j;
  ok(j.pass === null && j.pass_at === null, '[invite] after a no: no pass, no pass_at');
  const N = await ev('No date party'); const ny = await guest(N.id, 'No Date', '96551000003');
  j = await inv(ny.token); ok(j.pass === null && j.pass_at === null, '[invite] event with no date: no pass, pass_at null');
  const T = await ev('Tonight party', { starts_at: new Date(Date.now() + 2 * 3600e3).toISOString() }); const ty = await guest(T.id, 'Tonight', '96551000004');
  j = await inv(ty.token); ok(j.pass && j.pass.key, '[invite] event in 2 hours: released by default, pass shows');
  ok(Object.keys(j).sort().join() === 'confirmed_count,decline_reason,event,name,pass,pass_at,seats,status,token', '[invite] guest JSON keys: the old ones + pass + pass_at');

  // ---------- 3. claiming ----------
  const soon = new Date(Date.now() + 6 * 3600e3).toISOString();
  const A = await ev('Auto party', { starts_at: soon, pass_auto_send: true, headline: 'Noura & Fahad', lang: 'en', pass_release_at: new Date(Date.now() - 60e3).toISOString() });
  const a1 = await guest(A.id, 'A One', '96552000001', 'yes', 3), a2 = await guest(A.id, 'A Two', '55200002'), a3 = await guest(A.id, 'A Three', '96552000003', 'yes', 1, 'Mum');
  const aNoPhone = await guest(A.id, 'A NoPhone', null), aBlank = await guest(A.id, 'A Blank', '  ');
  await guest(A.id, 'A Pending', '96552000006', 'pending'); await guest(A.id, 'A No', '96552000007', 'no');
  const Boff = await ev('Manual party', { starts_at: soon, pass_release_at: new Date(Date.now() - 60e3).toISOString() });
  const b1 = await guest(Boff.id, 'B One', '96553000001');
  const Cfut = await ev('Not yet party', { starts_at: new Date(Date.now() + 5 * 864e5).toISOString(), pass_auto_send: true });
  await guest(Cfut.id, 'C One', '96554000001');
  const Dend = await ev('Ended party', { starts_at: new Date(Date.now() - 2 * 864e5).toISOString(), pass_auto_send: true });
  await guest(Dend.id, 'D One', '96555000001');
  const Edate = await ev('No date auto', { pass_auto_send: true, pass_release_at: new Date(Date.now() - 60e3).toISOString() });
  await guest(Edate.id, 'E One', '96556000001');

  let got = await claim();
  const ids = got.map(x => x.guest_id).sort();
  ok(ids.join() === [a1.id, a2.id, a3.id].sort().join(), `[claim] only due guests: auto on, released, not over, yes, with a phone (${got.map(x => x.name).join(', ')})`);
  const ga1 = got.find(x => x.guest_id === a1.id);
  ok(ga1 && ga1.event_id === A.id && ga1.phone === '96552000001' && ga1.name === 'A One' && ga1.people === 3 && ga1.token === a1.token
     && ga1.lang === 'en' && ga1.event_title === 'Noura & Fahad' && new Date(ga1.starts_at).toISOString() === soon && ga1.venue === 'Hall', '[claim] row has phone, name, people, token, lang, event title (headline), starts_at, venue');
  ok(Object.keys(ga1).join() === 'guest_id,event_id,phone,name,people,token,lang,event_title,starts_at,venue', '[claim] row columns as agreed');
  r = await row(a1.id); ok(r.status === 'sending' && r.attempts === 1 && r.channel === 'whatsapp', '[claim] claimed guests are marked sending, attempt 1');
  ok((await claim()).length === 0, '[claim] a second claim gets nobody (no double sending)');
  ok(!(await row(b1.id)) && !(await row(aNoPhone.id)) && !(await row(aBlank.id)), '[claim] auto-off event, no phone and blank phone are skipped');
  ok((await q(`select count(*)::int n from public.pass_sends where event_id in ($1,$2,$3)`, [Cfut.id, Dend.id, Edate.id]))[0].n === 0, '[claim] not-yet-released, ended and undated events are skipped');
  ok(!JSON.stringify(Object.keys(r)).match(/phone|token|key|body|text/), '[table] pass_sends has no phone, token, key or message column');

  // results
  ok(await result(a1.id, true, 'wamid.A1', null) === 'sent', '[result] ok → sent');
  r = await row(a1.id); ok(r.status === 'sent' && r.provider_msg_id === 'wamid.A1' && r.last_error === null, '[result] message id kept');
  ok(await result(a1.id, false, null, 'late') === null, '[result] a guest that is not sending is left alone');
  ok(await result(a2.id, false, null, 'network error for +965 5520 0002 / 96555200002') === 'failed', '[result] fail → failed');
  r = await row(a2.id); ok(r.status === 'failed' && r.attempts === 1 && !/5520|96555200002/.test(r.last_error), `[result] the stored error has no phone number (${r.last_error})`);
  ok((await claim()).length === 0, '[retry] a failed send waits (10 min × attempts) before trying again');
  await ago(a2.id, 11);
  got = await claim(); ok(got.length === 1 && got[0].guest_id === a2.id && (await row(a2.id)).attempts === 2, '[retry] after 10 minutes: tried again (attempt 2)');
  await result(a2.id, false, null, 'again'); await ago(a2.id, 19);
  ok((await claim()).length === 0, '[retry] second failure waits 20 minutes');
  await ago(a2.id, 21); got = await claim(); ok(got.length === 1 && (await row(a2.id)).attempts === 3, '[retry] then attempt 3');
  await result(a2.id, false, null, 'third'); await ago(a2.id, 600);
  ok((await claim()).length === 0 && (await row(a2.id)).status === 'failed', '[retry] never more than 3 attempts');
  // stuck 'sending' (the sender stopped half way)
  await ago(a3.id, 14); ok((await claim()).length === 0, '[stuck] a send from 14 minutes ago is still in progress');
  await ago(a3.id, 16); got = await claim();
  r = await row(a3.id);
  // changed with the duplicate-message review: a lost result may mean WhatsApp did send it, so no blind second message
  ok(got.length === 0 && r.status === 'failed' && r.attempts === 3 && r.last_error === 'unclear:no_result', `[stuck] after 15 minutes it counts as failed and is NOT sent again (it may have gone): hosts' list (${r.status}/${r.attempts}/${r.last_error})`);
  await ago(a3.id, 600); ok((await claim()).length === 0, '[stuck] ...not even much later');
  ok(await news('wamid.A3', 'sent', null, a3.id) === 'sent', '[stuck] WhatsApp\'s news with the guest id marks it sent after all');
  r = await row(a3.id); ok(r.status === 'sent' && r.provider_msg_id === 'wamid.A3' && r.last_error === null, '[stuck] ...and keeps the message id for later news');
  // unclear answers (timeout, WhatsApp server error) are not retried blind either
  const aU = await guest(A.id, 'A Unclear', '96552000010'); await claim();
  ok(await result(aU.id, false, null, 'unclear:network TimeoutError') === 'failed', '[unclear] a timeout is recorded as failed');
  r = await row(aU.id); await ago(aU.id, 600);
  ok(r.attempts === 3 && (await claim()).length === 0, '[unclear] and not tried again automatically');
  ok(await news('wamid.AU', 'delivered', null, crypto.randomUUID()) === null && (await row(aU.id)).status === 'failed', '[unclear] news for another guest id changes nothing');
  ok(await news('wamid.AU', 'delivered', null, aU.id) === 'delivered' && (await row(aU.id)).provider_msg_id === 'wamid.AU', '[unclear] WhatsApp\'s news with the guest id: delivered after all');
  // the result never saved, but WhatsApp's news comes first (row still 'sending')
  const aL = await guest(A.id, 'A Lost', '96552000011'); await claim();
  ok(await news('wamid.AL', 'sent', null, aL.id) === 'sent', '[lost] news for a guest still sending: sent');
  ok(await result(aL.id, true, 'wamid.AL', null) === null && (await row(aL.id)).provider_msg_id === 'wamid.AL', '[lost] the late result changes nothing (no double count)');
  ok(await news('wamid.AL', 'read', null, aL.id) === 'read', '[lost] later news finds it by message id');
  // the guest id never moves a row that is fine, retryable, or sent by hand
  const aR = await guest(A.id, 'A Retry', '96552000012'); await claim(); await result(aR.id, false, null, '130429 Rate limit');
  ok(await news('wamid.AR', 'sent', null, aR.id) === null && (await row(aR.id)).status === 'failed' && (await row(aR.id)).provider_msg_id === null, '[news] a clear failure (will be retried) is not touched by a guest id');
  await q(`update public.pass_sends set status = 'sent' where guest_id = $1`, [aR.id]);
  // setup problems (token, template) don't use up a guest's tries
  const CF = await ev('Config party', { starts_at: soon, pass_auto_send: true, pass_release_at: new Date(Date.now() - 31 * 60e3).toISOString() });
  const cf = await guest(CF.id, 'Config One', '96552100001');
  for (let k = 1; k <= 5; k++) {
    got = await claim();
    ok(got.length === 1 && got[0].guest_id === cf.id, `[config] run ${k}: the guest is claimed again`);
    ok(await result(cf.id, false, null, 'config:190 Error validating access token') === 'failed', `[config] run ${k}: setup error saved`);
  }
  r = await row(cf.id); ok(r.status === 'failed' && r.attempts === 0 && /^config:190/.test(r.last_error), `[config] after 5 runs with a bad token: no tries used (${r.attempts})`);
  ok(!(await q(`select 1 from public.audit_logs where event_id = $1 and action = 'pass_send_failed'`, [CF.id])).length, '[config] not logged per guest (it would fill the activity log)');
  got = await claim(); await result(cf.id, null, null, null);
  r = await row(cf.id); ok(r.status === 'failed' && r.attempts === 0, '[config] a claim given back after a setup error: still no tries used');
  await member(CF.id, 'cfhost@test.local', 'host');
  j = (await as('authenticated', who('cfhost@test.local'), `select public.pass_send_status_v2($1) j`, [CF.id])).rows[0].j;
  ok(j.counts.due === 1 && j.todo.length === 1 && j.todo[0].reason === 'not_sent_yet' && /^config:190/.test(j.last_error), `[config] hosts see it as not sent yet, with the setup error (${JSON.stringify(j.counts)}, ${j.todo.map(t => t.reason)})`);
  got = await claim(); ok(await result(cf.id, true, 'wamid.CF', null) === 'sent', '[config] once the token is fixed, it goes');
  // a send stuck for 15+ minutes shows as failed in the hosts' overview, even with tries left
  const cs = await guest(CF.id, 'Config Stuck', '96552100002');
  await q(`insert into public.pass_sends(guest_id,event_id,channel,status,attempts,updated_at) values ($1,$2,'whatsapp','sending',1, now() - interval '20 minutes')`, [cs.id, CF.id]);
  j = (await as('authenticated', who('cfhost@test.local'), `select public.pass_send_status_v2($1) j`, [CF.id])).rows[0].j;
  ok(j.counts.failed === 1 && j.todo.some(t => t.guest_id === cs.id && t.reason === 'failed') && j.last_error === 'unclear:no_result', `[status] a stuck send (1 try) is failed and on the hand list (${JSON.stringify(j.counts)})`);
  await q(`update public.events set pass_auto_send = false where id = $1`, [CF.id]);
  // a 'final:' error is not retried
  const a8 = await guest(A.id, 'A Final', '96552000008'); await claim();
  await result(a8.id, false, null, 'final:131026 Message undeliverable'); await ago(a8.id, 600);
  ok((await row(a8.id)).attempts === 3 && (await claim()).length === 0, '[retry] a final error (not on WhatsApp) is not retried');
  // giving a claim back (sender ran out of time)
  const a9 = await guest(A.id, 'A Back', '96552000009'); await claim();
  ok(await result(a9.id, null, null, null) === 'released' && !(await row(a9.id)), '[result] a claim given back leaves no trace');
  ok((await claim()).map(x => x.guest_id).join() === a9.id, '[result] and the guest is due again');
  await result(a9.id, true, 'wamid.A9', null);

  // many senders at once
  const M = await ev('Many party', { starts_at: soon, pass_auto_send: true, pass_release_at: new Date(Date.now() - 60e3).toISOString() });
  await q(`insert into public.guests(event_id,name,phone,seats,status,confirmed_count) select $1, 'M' || i, '9655' || lpad(i::text, 7, '0'), 1, 'yes', 1 from generate_series(1, 80) i`, [M.id]);
  const pool = new Pool({ host: '/tmp', port: 54329, user: 'postgres', database: 'postgres', max: 6 });
  const svcPool = async (sql, p) => { const k = await pool.connect(); try { await k.query('begin'); await k.query('set local role service_role'); const x = await k.query(sql, p); await k.query('commit'); return x.rows; } catch (e) { await k.query('rollback'); throw e; } finally { k.release(); } };
  const seen = [];
  await Promise.all([1, 2, 3, 4, 5].map(async () => { for (;;) { const x = await svcPool(`select guest_id from public.pass_send_claim(7)`); if (!x.length) return; seen.push(...x.map(y => y.guest_id)); } }));
  ok(seen.length === 80 && new Set(seen).size === 80, `[claim] 5 senders at once: all 80 guests claimed exactly once (${seen.length} claims, ${new Set(seen).size} guests)`);
  await q(`update public.pass_sends set status = 'sent' where event_id = $1`, [M.id]);

  // ---------- 4. webhook news ----------
  ok(await news('wamid.A1', 'delivered', null) === 'delivered', '[webhook] sent → delivered');
  ok(await news('wamid.A1', 'sent', null) === null && (await row(a1.id)).status === 'delivered', '[webhook] never goes back (delivered stays)');
  ok(await news('wamid.A1', 'read', null) === 'read', '[webhook] delivered → read');
  ok(await news('wamid.A1', 'failed', 'x') === null && (await row(a1.id)).status === 'read', '[webhook] failed after delivery is ignored');
  ok(await news('wamid.A1', 'delivered', null) === null, '[webhook] read stays read');
  ok(await news('wamid.A3', 'read', null) === 'read', '[webhook] sent → read directly');
  ok(await news('wamid.A9', 'failed', 'final:131026 Message undeliverable') === 'failed', '[webhook] sent → failed');
  r = await row(a9.id); ok(r.status === 'failed' && r.attempts === 3, '[webhook] a final failure is not retried');
  ok(await news('wamid.A9', 'delivered', null) === null, '[webhook] nothing moves a failed message');
  ok(await news('wamid.nope', 'delivered', null) === null && await news('wamid.A3', 'deleted', null) === null && await news('', 'read', null) === null, '[webhook] unknown ids and statuses are ignored');

  // ---------- 5. who can see and call what ----------
  await member(A.id, 'ahost@test.local', 'host'); await member(A.id, 'amum@test.local', 'host', 'Mum'); await member(A.id, 'adoor@test.local', 'door');
  await member(Boff.id, 'bhost@test.local', 'host');
  const seeRows = async email => (await as('authenticated', who(email), `select guest_id, event_id from public.pass_sends`)).rows;
  r = await seeRows('ahost@test.local'); ok(r.length >= 5 && r.every(x => x.event_id === A.id), `[rls] the host reads their event's rows only (${r.length})`);
  r = await seeRows('amum@test.local'); ok(r.length === 1 && r[0].guest_id === a3.id, '[rls] a host limited to one list reads that list only');
  ok((await seeRows('bhost@test.local')).length === 0, '[rls] a host of another event reads nothing');
  ok((await seeRows('adoor@test.local')).length === 0, '[rls] door staff read nothing');
  r = await seeRows('padmin@test.local'); ok(r.length >= 85, '[rls] an admin reads every row');
  ok(await as('anon', {}, `select * from public.pass_sends`).then(x => x.rowCount === 0, e => /permission denied/.test(e.message)), '[rls] logged-out visitors cannot read pass_sends');
  ok(await denied(as('authenticated', who('ahost@test.local'), `insert into public.pass_sends(guest_id,event_id,status) values ($1,$2,'manual')`, [b1.id, A.id])), '[rls] a host cannot add rows');
  r = await as('authenticated', who('ahost@test.local'), `update public.pass_sends set status = 'read' where guest_id = $1`, [a2.id]).then(x => x.rowCount, () => 0);
  ok(r === 0 && (await row(a2.id)).status === 'failed', '[rls] a host cannot change rows');
  r = await as('authenticated', who('padmin@test.local'), `delete from public.pass_sends where guest_id = $1`, [a2.id]).then(x => x.rowCount, () => 0);
  ok(r === 0 && !!(await row(a2.id)), '[rls] not even an admin can delete rows directly');
  for (const [sql, label] of [[`select * from public.pass_send_claim(1)`, 'pass_send_claim'], [`select public.pass_send_result('${a1.id}', true, 'x', null)`, 'pass_send_result'],
    [`select public.pass_send_status_update('wamid.A1', 'read', null)`, 'pass_send_status_update'], [`select public._v2_pass_release(e) from public.events e limit 1`, '_v2_pass_release']]) {
    ok(await denied(as('authenticated', who('padmin@test.local'), sql)) && await denied(as('authenticated', who('ahost@test.local'), sql)) && await denied(as('anon', {}, sql)), `[rights] admins, hosts and visitors cannot call ${label}`);
  }

  // ---------- 6. host overview ----------
  const S = await ev('Status party', { starts_at: soon, pass_release_at: new Date(Date.now() - 5 * 60e3).toISOString() });
  await member(S.id, 'shost@test.local', 'host'); await member(S.id, 'sdoor@test.local', 'door'); await member(S.id, 'sside@test.local', 'host', 'Dad');
  const s = {};
  for (const [k, ph, st, side] of [['todo', '96557000001', 'yes', null], ['nophone', null, 'yes', null], ['manual', '96557000003', 'yes', null], ['sent', '96557000004', 'yes', 'Dad'],
    ['deliv', '96557000005', 'yes', null], ['read', '96557000006', 'yes', null], ['dead', '96557000007', 'yes', 'Dad'], ['once', '96557000008', 'yes', null], ['pend', '96557000009', 'pending', null],
    ['stuck', '96557000010', 'yes', null]]) s[k] = await guest(S.id, 'S ' + k, ph, st, k === 'todo' ? 2 : 1, side);
  const put = (g, st, att, ch = 'whatsapp', mins = 0) => q(`insert into public.pass_sends(guest_id,event_id,channel,status,attempts,updated_at,last_error) values ($1,$2,$3,$4,$5, now() - make_interval(mins => $6), case when $4 = 'failed' then 'final:131026 Message undeliverable' end)`, [g.id, S.id, ch, st, att, mins]);
  await put(s.manual, 'manual', 0, 'manual'); await put(s.sent, 'sent', 1); await put(s.deliv, 'delivered', 1); await put(s.read, 'read', 2);
  await put(s.dead, 'failed', 3); await put(s.once, 'failed', 1); await put(s.stuck, 'sending', 3, 'whatsapp', 20);
  const status = async (email = 'shost@test.local', e = S.id) => (await as('authenticated', who(email), `select public.pass_send_status_v2($1) j`, [e])).rows[0].j;
  j = await status();
  ok(j.auto === false && Date.parse(j.release_at) < Date.now(), '[status] auto off, release time given');
  const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
  ok(same(j.counts, { due: 1, sent: 1, delivered: 1, read: 1, failed: 3, manual: 1, no_phone: 1 }), `[status] counts with auto off (${JSON.stringify(j.counts)})`);
  const todo = j.todo.map(t => t.name + ':' + t.reason).sort().join();
  ok(todo === 'S dead:failed,S once:failed,S stuck:failed,S todo:no_auto', `[status] todo with auto off: failed ones + unsent ones (${todo})`);
  const tt = j.todo.find(t => t.name === 'S todo');
  ok(Object.keys(tt).sort().join() === 'guest_id,name,people,phone,reason' && tt.guest_id === s.todo.id && tt.people === 2 && tt.phone === '96557000001', '[status] todo item: guest_id, name, people, phone, reason');
  ok(/^final:131026/.test(j.last_error), '[status] last_error shows the latest failure');
  await q(`update public.events set pass_auto_send = true where id = $1`, [S.id]);
  j = await status();
  ok(j.auto === true && j.counts.due === 2 && j.counts.failed === 2, `[status] auto on: a failure with tries left counts as due (${JSON.stringify(j.counts)})`);
  ok(j.todo.map(t => t.name + ':' + t.reason).sort().join() === 'S dead:failed,S stuck:failed', '[status] auto on, just released: only the failed ones are to do');
  await q(`update public.events set pass_release_at = now() - interval '31 minutes' where id = $1`, [S.id]);
  j = await status(); ok(j.todo.some(t => t.name === 'S todo' && t.reason === 'not_sent_yet'), '[status] auto on, 30+ minutes after release and still not sent: not_sent_yet');
  await q(`update public.events set pass_auto_send = false, pass_release_at = now() + interval '1 day' where id = $1`, [S.id]);
  j = await status(); ok(j.todo.length === 0 && j.counts.manual === 1, '[status] before release: nothing to do yet');
  await q(`update public.events set pass_release_at = now() - interval '5 minutes' where id = $1`, [S.id]);
  j = await status('sside@test.local'); ok(j.counts.sent === 1 && j.counts.failed === 1 && j.counts.due === 0 && j.todo.length === 1 && j.todo[0].name === 'S dead', '[status] a host limited to one list sees that list');
  j = await status('padmin@test.local'); ok(j.counts.manual === 1, '[status] an admin can see it');
  ok(await denied(status('sdoor@test.local')) && await denied(status('bhost@test.local')) && await denied(as('anon', {}, `select public.pass_send_status_v2($1)`, [S.id])), '[status] door staff, other hosts and visitors are refused');
  const Z = await ev('Over party', { starts_at: new Date(Date.now() - 3 * 864e5).toISOString() }); await member(Z.id, 'shost@test.local', 'host'); await guest(Z.id, 'Z', '96558000001');
  j = await status('shost@test.local', Z.id); ok(j.todo.length === 0 && j.counts.due === 1, '[status] after the event: nothing to do');

  // ---------- 7. sent by hand ----------
  const mark = (email, g) => as('authenticated', who(email), `select public.pass_mark_manual_v2($1) j`, [g]).then(x => x.rows[0].j);
  j = await mark('shost@test.local', s.todo.id); r = await row(s.todo.id);
  ok(j.status === 'manual' && j.guest_id === s.todo.id && r.channel === 'manual' && r.status === 'manual', '[manual] the host marks a pass as sent by hand');
  j = await mark('shost@test.local', s.dead.id); ok(j.status === 'manual', '[manual] a failed one can be marked too');
  j = await mark('shost@test.local', s.read.id); ok(j.status === 'read' && (await row(s.read.id)).status === 'read', '[manual] one WhatsApp already delivered stays as it is');
  ok(await mark('shost@test.local', s.pend.id).then(() => false, e => /NOT_CONFIRMED/.test(e.message)), '[manual] only confirmed guests');
  ok(await denied(mark('sdoor@test.local', s.once.id)) && await denied(mark('bhost@test.local', s.once.id)) && await denied(mark('sside@test.local', s.once.id)), '[manual] door staff, other hosts and a host of another list are refused');
  ok(await denied(as('anon', {}, `select public.pass_mark_manual_v2($1)`, [s.once.id])), '[manual] visitors are refused');
  await q(`update public.events set pass_auto_send = true where id = $1`, [S.id]);
  got = await claim(); ok(!got.some(x => x.guest_id === s.todo.id || x.guest_id === s.dead.id), '[manual] a guest marked by hand is never sent automatically');
  for (const x of got) await result(x.guest_id, true, 'wamid.' + x.guest_id, null);
  await q(`update public.events set pass_auto_send = false where id = $1`, [S.id]);
  j = await status(); ok(j.counts.manual === 3 && !j.todo.some(t => t.name === 'S todo' || t.name === 'S dead'), '[manual] the overview counts them as sent by hand');

  // ---------- 8. activity log ----------
  const logs = await q(`select action, actor, details from public.audit_logs where action like 'pass\\_%' and action <> 'pass_scan' order by id`);
  const acts = new Set(logs.map(l => l.action));
  ok(['pass_sent', 'pass_send_failed', 'pass_manual', 'pass_settings'].every(a => acts.has(a)), `[log] sends, failures, manual sends and setting changes are logged (${[...acts].join(', ')})`);
  ok(logs.find(l => l.action === 'pass_manual').actor === 'shost@test.local', '[log] manual sends say who');
  const all = JSON.stringify(logs);
  const secrets = (await q(`select g.phone, g.token, p.pass_key from public.guests g join public.guest_passes p on p.guest_id = g.id where g.event_id in ($1,$2)`, [A.id, S.id]));
  ok(!secrets.some(x => (x.phone && all.includes(x.phone)) || all.includes(x.token) || all.includes(x.pass_key)), '[log] no phone, token or pass key in the log');
  ok(!/96555200002|5520 0002/.test(all), '[log] errors in the log have no phone numbers');

  // ---------- 9. the server function's logic, against this database ----------
  const P = await import(require('path').join(repo, 'supabase/functions/_shared/pass.ts'));
  await q(`update public.events set pass_auto_send = false`);
  const H = await ev('Handler party', { starts_at: soon, pass_auto_send: true, pass_release_at: new Date(Date.now() - 60e3).toISOString() });
  const h1 = await guest(H.id, 'هند', '٥٠٠٠١٢٣٤'), h2 = await guest(H.id, 'Hamad', '+965 6000 1234', 'yes', 2), h3 = await guest(H.id, 'Bad Phone', '123');
  const rpc = async (fn, args) => {
    const keys = Object.keys(args);
    try {
      const [info] = await q(`select proretset from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [fn]);
      const call = `public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')})`;
      const rows = await svcPool(info.proretset ? `select to_jsonb(x) j from ${call} x` : `select to_jsonb(${call}) j`, keys.map(k => args[k]));
      return { data: info.proretset ? rows.map(x => x.j) : rows[0].j, error: null };
    } catch (e) { return { data: null, error: { message: e.message } }; }
  };
  const SECRET = 'test-cron-secret-0123456789';
  const post = (secret = SECRET) => new Request('https://x.test/functions/v1/send-door-passes', { method: 'POST', headers: { 'x-cron-secret': secret }, body: '{}' });
  const logged = []; const log = (m, f) => logged.push(JSON.stringify({ m, ...f }));
  let res = await P.handleSendRequest(post(), { CRON_SECRET: SECRET }, { rpc, log });
  j = await res.json();
  ok(res.status === 200 && JSON.stringify(j) === '{"mode":"off"}' && !(await row(h1.id)), '[function] mode off (the default): answers {mode:"off"} and claims nobody');
  res = await P.handleSendRequest(post('wrong-secret-0123456789'), { CRON_SECRET: SECRET, WHATSAPP_MODE: 'mock' }, { rpc, log });
  ok(res.status === 401 && !(await row(h1.id)), '[function] a wrong x-cron-secret is refused and claims nobody');
  res = await P.handleSendRequest(post(), { CRON_SECRET: SECRET, WHATSAPP_MODE: 'live' }, { rpc, log, fetch: () => { throw new Error('no network in tests'); } });
  ok(res.status === 500 && (await res.json()).error === 'missing_config' && !(await row(h1.id)), '[function] live without WhatsApp settings: refuses and claims nobody');
  const sentBodies = [];
  res = await P.handleSendRequest(post(), { CRON_SECRET: SECRET, WHATSAPP_MODE: 'mock' }, { rpc, log, send: async b => { sentBodies.push(b); return P.mockSender(b); } });
  j = await res.json();
  ok(res.status === 200 && j.mode === 'mock' && j.claimed === 3 && j.sent === 2 && j.failed === 1 && j.released === 0, `[function] mock: claims 3, sends 2, the bad phone fails (${JSON.stringify(j)})`);
  const r1 = await row(h1.id), r2 = await row(h2.id), r3 = await row(h3.id);
  ok(r1.status === 'sent' && /^mock-/.test(r1.provider_msg_id) && r2.status === 'sent', '[function] mock: rows marked sent with mock ids');
  ok(r3.status === 'failed' && r3.last_error === 'final:bad_phone' && r3.attempts === 3, '[function] mock: a phone that can\'t be used fails for good');
  ok(sentBodies.map(b => b.to).sort().join() === '96550001234,96560001234', '[function] phones go out as 965 + 8 digits (Arabic digits and +965 spaces handled)');
  const bh = sentBodies.find(b => b.to === '96550001234');
  ok(bh.template.language.code === 'ar' && bh.template.components[0].parameters[0].text === 'هند' && bh.template.components[1].parameters[0].text === h1.token, '[function] the message uses the guest\'s name and invite token');
  ok(bh.biz_opaque_callback_data === h1.id, '[function] the message carries the guest id for WhatsApp to send back');
  ok(!logged.some(l => l.includes(h1.token) || l.includes('96550001234') || l.includes('96560001234')), '[function] the logs have no tokens or full phone numbers');
  res = await P.handleSendRequest(post(), { CRON_SECRET: SECRET, WHATSAPP_MODE: 'mock' }, { rpc, log });
  j = await res.json(); ok(j.claimed === 0 && j.sent === 0, '[function] a second run sends nothing again');
  // the webhook, signed like Meta does
  const APP = 'test-app-secret';
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { statuses: [
    { id: r1.provider_msg_id, status: 'delivered', recipient_id: '96550001234' }, { id: r2.provider_msg_id, status: 'read' }] } }] }] });
  const sig = 'sha256=' + crypto.createHmac('sha256', APP).update(body).digest('hex');
  const hook = (b, s_) => new Request('https://x.test/functions/v1/whatsapp-webhook', { method: 'POST', headers: { 'x-hub-signature-256': s_ }, body: b });
  res = await P.handleWebhookRequest(hook(body, 'sha256=' + '0'.repeat(64)), { WHATSAPP_APP_SECRET: APP }, { rpc });
  ok(res.status === 401 && (await row(h1.id)).status === 'sent', '[webhook fn] a wrong signature changes nothing');
  res = await P.handleWebhookRequest(hook(body, sig), { WHATSAPP_APP_SECRET: APP }, { rpc });
  j = await res.json();
  ok(res.status === 200 && j.statuses === 2 && j.changed === 2 && (await row(h1.id)).status === 'delivered' && (await row(h2.id)).status === 'read', '[webhook fn] signed news updates the rows');
  await pool.end();
};
