const { Client } = require('pg'); const fs = require('fs');
const repo = require('path').resolve(__dirname, '../..');
const c = new Client({ host: '/tmp', port: 54329, user: 'postgres', database: 'postgres' });
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1; };
async function as(role, claims, sql, params) {
  await c.query('begin');
  try {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims || {})]);
    await c.query(`set local role ${role}`);
    const r = await c.query(sql, params); await c.query('commit'); return r;
  } catch (e) { await c.query('rollback'); throw e; }
}
(async () => {
  await c.connect();
  await c.query('drop schema if exists public cascade; create schema public; grant all on schema public to public;');
  await c.query(fs.readFileSync(__dirname + '/supabase-stub.sql', 'utf8'));
  await c.query(fs.readFileSync(repo + '/supabase/migrations/0000_baseline.sql', 'utf8')); ok(true, 'baseline runs on an empty database');
  // Order: baseline (live before 12 Nov) -> migrations/002_mvp_core.sql (already on live) -> supabase/migrations/0003+
  const core = fs.readFileSync(repo + '/migrations/002_mvp_core.sql', 'utf8');
  await c.query(core); await c.query(core); ok(true, '002_mvp_core.sql runs on the baseline, and runs again safely');
  let LEG = null;   // guests that exist before 0005, to check its backfill
  for (const f of fs.readdirSync(repo + '/supabase/migrations').filter(f => f >= '0003').sort()) {
    if (f >= '0005' && !LEG) {
      const le = (await c.query(`insert into public.events(title) values ('Legacy party') returning id`)).rows[0].id;
      await c.query(`insert into public.guests(event_id,name,phone,seats,status) values ($1,'L1','96511111111',2,'yes'),($1,'L2','96511111112',1,'pending'),($1,'L3',null,1,'no')`, [le]);
      LEG = le;
    }
    const sql = fs.readFileSync(repo + '/supabase/migrations/' + f, 'utf8');
    await c.query(sql); await c.query(sql); ok(true, f + ' runs, and runs again safely');
  }
  await c.query(`grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role`);
  // people
  const U = {}; for (const n of ['admin', 'solo', 'cohost', 'door']) U[n] = (await c.query(`insert into auth.users(email) values ($1) returning id`, [n + '@test.local'])).rows[0].id;
  await c.query(`insert into public.admin_emails values ('admin@test.local')`);
  const ev = async t => (await c.query(`insert into public.events(title) values ($1) returning id`, [t])).rows[0].id;
  const E1 = await ev('Solo party'), E2 = await ev('Shared wedding');
  await c.query(`insert into public.event_members(event_id,email,role) values ($1,'solo@test.local','host'),($2,'solo@test.local','host'),($2,'cohost@test.local','host'),($1,'door@test.local','door')`, [E1, E2]);
  await c.query(`insert into public.guests(event_id,name,phone,seats) values ($1,'G1','96500000001',2),($1,'G2','96500000002',1),($2,'G3','96500000003',1)`, [E1, E2]);
  await c.query(`insert into public.audit_logs(event_id, actor, action) values ($1, 'solo@test.local', 'test')`, [E2]);
  await c.query(`insert into public.checkin_events(event_id, people, by_email) values ($1, 1, 'solo@test.local')`, [E2]);
  const tok = (await c.query(`select token from public.guests where name='G3'`)).rows[0].token;
  const claims = n => ({ sub: U[n], email: n + '@test.local', role: 'authenticated' });

  // existing behaviour still works
  let r = await as('anon', {}, `select public.respond($1,'yes') j`, [tok]); ok(r.rows[0].j.status === 'yes', 'guest can still reply with their personal link');
  r = await as('authenticated', claims('cohost'), `select count(*)::int n from public.guests`); ok(r.rows[0].n === 1, 'host still sees only their own event guests');

  // summary
  r = await as('authenticated', claims('solo'), `select public.my_account_summary() j`); const s = r.rows[0].j;
  ok(s.events_to_delete.length === 1 && s.events_to_delete[0].title === 'Solo party' && s.events_to_delete[0].guests === 2, 'summary lists only the event they host alone, with guest count');
  ok(s.memberships === 2 && s.is_admin === false, 'summary counts their access correctly');
  r = await as('anon', {}, `select 1`).then(() => as('anon', {}, `select public.my_account_summary()`)).then(() => false, () => true); ok(r, 'logged-out visitors cannot call the summary');

  // only the server may delete
  r = await as('authenticated', claims('solo'), `select public.delete_account_data($1,$2)`, [U.solo, 'solo@test.local']).then(() => false, () => true);
  ok(r, 'the app cannot call delete_account_data directly');
  r = await as('service_role', {}, `select public.delete_account_data($1,$2) j`, [U.admin, 'ADMIN@test.local']).then(() => false, e => /admin accounts/.test(e.message));
  ok(r, 'admin accounts are refused');
  r = await as('service_role', {}, `select public.delete_account_data($1,$2) j`, [U.solo, 'Solo@Test.local']); const d = r.rows[0].j;
  ok(d.event_ids.length === 1 && d.event_ids[0] === E1 && d.guests_deleted === 2 && d.memberships_removed === 2, 'deletion reports the right numbers');
  const left = (await c.query(`select (select count(*) from public.events where id=$1)::int e1, (select count(*) from public.events where id=$2)::int e2, (select count(*) from public.guests where event_id=$1)::int g1, (select count(*) from public.guests where event_id=$2)::int g2, (select count(*) from public.event_members where email='solo@test.local')::int m, (select count(*) from public.event_members where event_id=$2)::int m2`, [E1, E2])).rows[0];
  ok(left.e1 === 0 && left.g1 === 0, 'their solo event and its guests are gone');
  ok(left.e2 === 1 && left.g2 === 1 && left.m2 === 1, 'the shared event, its guests and the other host stay');
  ok(left.m === 0, 'all their access is removed');
  const trace = (await c.query(`select (select count(*) from public.audit_logs where actor ilike 'solo@%')::int a, (select count(*) from public.checkin_events where by_email ilike 'solo@%')::int b, (select count(*) from public.audit_logs where event_id=$1)::int kept`, [E2])).rows[0];
  ok(trace.a === 0 && trace.b === 0 && trace.kept >= 1, 'their email is blanked in shared events\' records, the records stay');
  const log = (await c.query(`select * from public.account_deletions`)).rows; ok(log.length === 1 && !JSON.stringify(log).includes('@'), 'deletion log has no email');
  r = await as('authenticated', claims('cohost'), `select count(*)::int n from public.account_deletions`); ok(r.rows[0].n === 0, 'hosts cannot read the deletion log');
  r = await as('authenticated', claims('admin'), `select count(*)::int n from public.account_deletions`); ok(r.rows[0].n === 1, 'admins can read the deletion log');
  // ---------- door pass (0005) ----------
  if (fs.existsSync(repo + '/supabase/migrations/0005_door_pass.sql')) await doorPass();
  // ---------- door passes on WhatsApp (0006) ----------
  if (fs.existsSync(repo + '/supabase/migrations/0006_pass_sending.sql')) await require('./pass_sending.js')({ c, ok, as, repo });
  // ---------- self-serve hosts, phone login, payments, invites (0007) ----------
  if (fs.existsSync(repo + '/supabase/migrations/0007_self_serve.sql')) await require('./self_serve.js')({ c, ok, as, repo });
  await c.end();
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });

async function doorPass() {
  const KEY = /^[A-Za-z0-9_-]{22,}$/, CODE = /^[1-9][0-9]{3}$/;
  const who = email => ({ sub: require('crypto').randomUUID(), email, role: 'authenticated' });
  const q = async (sql, p) => (await c.query(sql, p)).rows;
  let r, j;

  // backfill: guests that were there before the file ran
  const legacyEvent = (await q(`select id from public.events where title = 'Legacy party'`))[0].id;
  const PK = `(select p.pass_key from public.guest_passes p where p.guest_id = g.id)`;   // the key lives in its own locked table
  const leg = await q(`select ${PK} pass_key, g.pass_code from public.guests g where g.event_id = $1`, [legacyEvent]);
  ok(leg.length === 3 && leg.every(g => KEY.test(g.pass_key) && CODE.test(g.pass_code)), 'existing guests get a pass key and a 4-digit code');
  ok(new Set(leg.map(g => g.pass_code)).size === 3 && new Set(leg.map(g => g.pass_key)).size === 3, 'backfilled codes and keys are all different');

  // new guests get a pass, whatever the insert says
  const ev = async t => (await q(`insert into public.events(title) values ($1) returning id, public_code`, [t]))[0];
  const P = await ev('Pass party'), O = await ev('Other party');
  // 0006 shows a pass only once it is released (these events have no date): release them now
  if (fs.existsSync(repo + '/supabase/migrations/0006_pass_sending.sql')) await q(`update public.events set pass_release_at = now() - interval '1 minute' where id in ($1, $2)`, [P.id, O.id]);
  await c.query(`insert into public.event_members(event_id,email,role,side,expires_at) values
    ($1,'host3@test.local','host',null,null), ($1,'mum3@test.local','host','Mum',null), ($1,'door3@test.local','door',null,null),
    ($1,'olddoor@test.local','door',null, now() - interval '1 hour'), ($2,'door4@test.local','door',null,null)`, [P.id, O.id]);
  const withKey = async row => ({ ...row, pass_key: (await q(`select pass_key from public.guest_passes where guest_id = $1`, [row.id]))[0]?.pass_key });
  const [g0] = await q(`insert into public.guests(event_id,name,phone,seats,pass_code) values ($1,'Noura','96522222221',3,'0000') returning *`, [P.id]);
  ok(!('pass_key' in g0), 'the guest row itself has no pass_key column');
  const g = await withKey(g0);
  ok(KEY.test(g.pass_key) && g.pass_key.length >= 32 && CODE.test(g.pass_code) && g.pass_code !== '0000', 'a new guest always gets a fresh key and code from the database');
  const o = await withKey((await q(`insert into public.guests(event_id,name,phone,seats) values ($1,'Other','96522222229',1) returning *`, [O.id]))[0]);

  // many inserts: one big import plus four writers adding guests at the same time
  await c.query(`insert into public.guests(event_id,name,seats) select $1, 'Bulk ' || i, 1 from generate_series(1, 500) i`, [P.id]);
  const { Client } = require('pg');
  await Promise.all([1, 2, 3, 4].map(async w => {
    const k = new Client({ host: '/tmp', port: 54329, user: 'postgres', database: 'postgres' }); await k.connect();
    for (let i = 0; i < 60; i++) await k.query(`insert into public.guests(event_id,name,seats) values ($1, $2, 1)`, [P.id, 'W' + w + '-' + i]);
    await k.end();
  }));
  const s = (await q(`select count(*)::int n, count(distinct g.pass_code)::int codes, count(distinct p.pass_key)::int keys,
    bool_and(g.pass_code ~ '^[1-9][0-9]{3}$') fmt from public.guests g join public.guest_passes p on p.guest_id = g.id where g.event_id = $1`, [P.id]))[0];
  ok(s.n === 741 && s.codes === 741 && s.keys === 741 && s.fmt, 'codes stay unique within an event under many inserts at once (741 guests)');
  ok((await q(`select count(*)::int n from (select pass_key from public.guest_passes group by 1 having count(*) > 1) x`))[0].n === 0, 'keys are unique across all events');
  ok((await q(`select count(*)::int n from public.guests g where not exists (select 1 from public.guest_passes p where p.guest_id = g.id)`))[0].n === 0, 'every guest has a key');

  // host edits can't change a pass
  await as('authenticated', who('host3@test.local'), `update public.guests set pass_code = '1234', sent_at = now() where id = $1`, [g.id]);
  const g2 = await withKey((await q(`select id, pass_code, sent_at from public.guests where id = $1`, [g.id]))[0]);
  ok(g2.pass_key === g.pass_key && g2.pass_code === g.pass_code && g2.sent_at, 'a host edit leaves the pass key and code as they were');

  // the key never reaches a host, admin or door client (not in rows, to_jsonb(guest) results or realtime)
  const locked = async (email, sql, p) => as('authenticated', who(email), sql, p).then(x => (x.rowCount || 0) === 0 && !JSON.stringify(x.rows).includes(g.pass_key), e => /permission denied|row-level security/.test(e.message));
  ok((await q(`select count(*)::int n from information_schema.columns where table_schema = 'public' and table_name = 'guests' and column_name = 'pass_key'`))[0].n === 0, 'guests has no pass_key column, so select(*) and realtime rows cannot carry it');
  for (const [email, label] of [['host3@test.local', 'a host'], ['admin@test.local', 'an admin'], ['door3@test.local', 'door staff']]) {
    ok(await locked(email, `select * from public.guest_passes`), label + ' cannot read guest_passes');
    ok(await locked(email, `update public.guest_passes set pass_key = 'x' where guest_id = $1 returning guest_id`, [g.id]), label + ' cannot change a key');
  }
  ok(await locked('host3@test.local', `insert into public.guest_passes(guest_id, pass_key) values ($1, 'mine-mine-mine-mine-mine-mine') returning guest_id`, [o.id]), 'a host cannot add a key');
  ok(await as('anon', {}, `select * from public.guest_passes`).then(x => x.rowCount === 0, e => /permission denied/.test(e.message)), 'logged-out visitors cannot read guest_passes');
  r = await as('authenticated', who('host3@test.local'), `select * from public.guests where id = $1`, [g.id]);
  ok(r.rows.length === 1 && !JSON.stringify(r.rows).includes(g.pass_key), 'the host\'s own guest row (select *) has the code but no key');
  const b1 = await withKey((await q(`select id from public.guests where event_id = $1 and name = 'Bulk 1'`, [P.id]))[0]);
  r = (await as('authenticated', who('host3@test.local'), `select public.host_set_extras_v2($1, 0) j`, [b1.id])).rows[0].j;
  ok(r.id === b1.id && 'pass_code' in r && !('pass_key' in r) && !JSON.stringify(r).includes(b1.pass_key), 'host_set_extras_v2 (to_jsonb of the guest) has no key');
  r = (await as('authenticated', who('host3@test.local'), `select public.host_set_reply_v2($1, 'pending', null) j`, [b1.id])).rows[0].j;
  ok(r.id === b1.id && !('pass_key' in r) && !JSON.stringify(r).includes(b1.pass_key), 'host_set_reply_v2 (to_jsonb of the guest) has no key');
  r = await as('authenticated', who('host3@test.local'), `select public._v2_guest_json(g, e) j from public.guests g, public.events e where g.id = $1 and e.id = g.event_id`, [g.id]).then(() => false, e => /permission denied/.test(e.message));
  ok(r, 'the app cannot call _v2_guest_json to get a key');

  // the guest sees the pass only while the reply is yes
  const inv = async (sql, p) => (await as('anon', {}, sql, p)).rows[0].j;
  j = await inv(`select public.get_invite_v2($1) j`, [g.token]);
  const oldKeys = ['name', 'seats', 'status', 'token', 'decline_reason', 'confirmed_count', 'event'];
  ok(oldKeys.every(k => k in j) && 'pass' in j && j.pass === null, 'pending invite: every old key is still there, pass is null');
  j = await inv(`select public.respond_v2($1,'yes',2,null) j`, [g.token]);
  ok(j.pass && j.pass.key === g.pass_key && j.pass.code === g.pass_code && Object.keys(j.pass).length === 2, 'replying yes returns the pass {key, code}');
  j = await inv(`select public.get_invite_v2($1) j`, [g.token]);
  ok(j.pass && j.pass.key === g.pass_key && j.confirmed_count === 2, 'the invite shows the pass after a yes');
  j = await inv(`select public.respond_v2($1,'no',null,null) j`, [g.token]);
  ok(j.pass === null, 'replying no hides the pass');
  j = await inv(`select public.respond_v2($1,'yes',3,null) j`, [g.token]);
  ok(j.pass && j.pass.key === g.pass_key, 'replying yes again shows the same pass');
  j = await inv(`select public.public_rsvp_v2($1,'Link Guest','yes',null,null) j`, [P.public_code]);
  ok(j.pass && KEY.test(j.pass.key) && CODE.test(j.pass.code), 'a shared-link yes gets a pass too');
  j = await inv(`select public.public_rsvp_v2($1,'Link Sorry','no',null,null) j`, [P.public_code]);
  ok(j.pass === null, 'a shared-link no gets no pass');
  j = await inv(`select public.get_invite($1) j`, [g.token]);
  ok(!('pass' in j) && !JSON.stringify(j).includes(g.pass_key), 'the old get_invite is unchanged (no pass)');

  // door list: pass_code, never pass_key
  r = await as('authenticated', who('door3@test.local'), `select * from public.door_list_v2($1)`, [P.id]);
  const row = r.rows.find(x => x.id === g.id);
  ok(r.rows.length === 743 && row.pass_code === g.pass_code, 'door_list_v2 rows have pass_code');
  ok(r.fields.every(f => f.name !== 'pass_key' && f.name !== 'token') && !JSON.stringify(r.rows).includes(g.pass_key), 'door_list_v2 never has pass_key');
  ok(r.fields.map(f => f.name).join() === 'id,name,phone,seats,status,confirmed_count,checked_in_count,decline_reason,side,checked_in_at,pass_code', 'door_list_v2 keeps its columns and adds pass_code at the end');
  r = await as('anon', {}, `select * from public.door_list_v2($1)`, [P.id]).then(() => false, () => true); ok(r, 'logged-out visitors still cannot call door_list_v2');

  // scanning a pass
  const scan = (email, ev_, key) => as('authenticated', who(email), `select public.door_pass_lookup_v2($1,$2) j`, [ev_, key]).then(x => x.rows[0].j);
  const before = (await q(`select count(*)::int n from public.audit_logs where action = 'pass_scan'`))[0].n;
  j = await scan('door3@test.local', P.id, g.pass_key);
  ok(j && JSON.stringify(Object.keys(j).sort()) === JSON.stringify(Object.keys(row).sort()) && j.id === g.id && j.pass_code === g.pass_code && j.name === 'Noura' && j.status === 'yes' && j.confirmed_count === 3, 'door scan returns the same row door_list_v2 has');
  ok(!('pass_key' in j) && !('token' in j), 'the scan result has no pass key or token');
  j = await scan('door3@test.local', P.id, 'https://snalawwad.github.io/RSVP/door.html#p=' + g.pass_key);
  ok(j && j.id === g.id, 'door scan also accepts the whole QR link');
  j = await scan('host3@test.local', P.id, '  ' + g.pass_key + ' ');
  ok(j && j.id === g.id, 'the host can scan too');
  j = await scan('admin@test.local', P.id, g.pass_key);
  ok(j && j.id === g.id, 'an admin can scan too');
  j = await scan('mum3@test.local', P.id, g.pass_key);
  ok(j === null, 'a host limited to one list gets null for a guest on another list');
  j = await scan('door3@test.local', P.id, g.pass_key.slice(0, -1) + (g.pass_key.endsWith('A') ? 'B' : 'A'));
  ok(j === null, 'a wrong key gives null');
  j = await scan('door3@test.local', P.id, 'SN-' + g.pass_code);
  ok(j === null, 'the short code is not a key (gives null)');
  j = await scan('door3@test.local', P.id, null); ok(j === null, 'an empty scan gives null');
  j = await scan('door4@test.local', O.id, g.pass_key);
  ok(j === null, 'a pass from another event gives null');
  j = await scan('door4@test.local', O.id, o.pass_key); ok(j && j.id === o.id, 'the other event\'s door finds its own guest');
  r = await scan('door4@test.local', P.id, g.pass_key).then(() => false, e => /Not allowed/.test(e.message)); ok(r, 'door staff of another event are refused');
  r = await scan('olddoor@test.local', P.id, g.pass_key).then(() => false, e => /Not allowed/.test(e.message)); ok(r, 'door staff whose access ended are refused');
  r = await scan('nobody@test.local', P.id, g.pass_key).then(() => false, e => /Not allowed/.test(e.message)); ok(r, 'a logged-in stranger is refused');
  r = await as('anon', {}, `select public.door_pass_lookup_v2($1,$2)`, [P.id, g.pass_key]).then(() => false, e => /permission denied/.test(e.message)); ok(r, 'logged-out visitors cannot scan');
  for (const f of ['_v2_pass_key()', `_v2_pass_code('${P.id}'::uuid, null)`]) {
    r = await as('authenticated', who('host3@test.local'), `select public.${f}`).then(() => false, e => /permission denied/.test(e.message)); ok(r, 'the app cannot call ' + f.split('(')[0]);
  }

  // activity log
  const logs = await q(`select actor, details from public.audit_logs where action = 'pass_scan' order by id`);
  ok(logs.length - before === 10, 'every allowed scan is logged as pass_scan (10), refused ones are not');
  const mine = logs.slice(before);
  ok(mine[0].actor === 'door3@test.local' && mine[0].details.guest === g.id && mine[0].details.found === true, 'the log says who scanned and which guest');
  ok(mine.some(l => l.details.found === false && l.details.guest === null), 'a miss is logged as found: false');
  ok(!JSON.stringify(logs).includes(g.pass_key) && !JSON.stringify(logs).includes(o.pass_key), 'the log never holds a pass key');

  // a walk-in the host approves gets a pass as well
  const x = (await as('authenticated', who('door3@test.local'), `select public.request_exception_v2($1,null,'Walk In',2,null) j`, [P.id])).rows[0].j;
  await as('authenticated', who('host3@test.local'), `select public.decide_exception_v2($1,true)`, [x.id]);
  const [w] = await q(`select ${PK} pass_key, g.pass_code from public.guests g where g.event_id = $1 and g.name = 'Walk In'`, [P.id]);
  ok(w && KEY.test(w.pass_key) && CODE.test(w.pass_code), 'a walk-in the host lets in gets a pass');

  // deleting a guest removes its key
  const [gone] = await q(`insert into public.guests(event_id,name,seats) values ($1,'Gone',1) returning id`, [P.id]);
  await q(`delete from public.guests where id = $1`, [gone.id]);
  ok((await q(`select count(*)::int n from public.guest_passes where guest_id = $1`, [gone.id]))[0].n === 0, 'deleting a guest deletes its key');
}
