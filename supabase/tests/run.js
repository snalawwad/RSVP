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
  for (const f of fs.readdirSync(repo + '/supabase/migrations').filter(f => f >= '0001').sort()) {
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
  const log = (await c.query(`select * from public.account_deletions`)).rows; ok(log.length === 1 && !JSON.stringify(log).includes('@'), 'deletion log has no email');
  r = await as('authenticated', claims('cohost'), `select count(*)::int n from public.account_deletions`); ok(r.rows[0].n === 0, 'hosts cannot read the deletion log');
  r = await as('authenticated', claims('admin'), `select count(*)::int n from public.account_deletions`); ok(r.rows[0].n === 1, 'admins can read the deletion log');
  await c.end();
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
