// Checks for supabase/migrations/0007_self_serve.sql (self-serve hosts, phone login, packages,
// test payments, invites on WhatsApp) and for the checkout / checkout-test / payment-webhook /
// send-invites logic in functions/_shared, run against the throwaway Postgres. Never touches Supabase or Meta.
const crypto = require('crypto');

module.exports = async function selfServe({ c, ok, as, repo }) {
  const q = async (sql, p) => (await c.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const T = s => '[0007] ' + s;
  let r;

  // ---------- people ----------
  const mk = async (email, phone) => {
    const id = (await one(`insert into auth.users(email) values ($1) returning id`, [email]))?.id;
    return { sub: id, email: email || '', phone: phone || '', role: 'authenticated' };
  };
  const H = await mk('sshost@test.local'), H2 = await mk('sshost2@test.local'), X = await mk('stranger7@test.local');
  const P = await mk(null, '96599887766');            // phone-only host
  const CO = await mk(null, '96555500001');           // phone-only co-host
  const D = await mk('ssdoor@test.local');            // door by email
  const G = await mk(null, '96566600001');            // a guest with an account
  const A = { sub: crypto.randomUUID(), email: 'admin@test.local', role: 'authenticated' };   // admin (admin_emails)

  const call = (who, sql, p) => as('authenticated', who, sql, p);
  const val = async (who, sql, p) => (await call(who, `select ${sql} j`, p)).rows[0].j;
  const err = (pr) => pr.then(() => '(no error)', e => e.message);
  const anon = (sql, p) => as('anon', {}, `select ${sql} j`, p).then(r => r.rows[0].j);
  const svc = (sql, p) => as('service_role', {}, `select ${sql} j`, p).then(r => r.rows[0].j);

  // ---------- 1. the live pilot is untouched ----------
  const st = await one(`select count(*) filter (where status <> 'active')::int bad, count(*) filter (where send_channel <> 'by_hand' or package is not null or door_addon or paid_at is not null)::int other, count(*)::int n from public.events`);
  ok(st.n > 0 && st.bad === 0 && st.other === 0, T('every event that existed before 0007 is active, by hand, with no package'));
  r = await one(`select column_default d from information_schema.columns where table_schema='public' and table_name='events' and column_name='status'`);
  ok(/active/.test(r.d), T('a new event made the old way (admin page) is active by default'));

  // email users get exactly what they got before (old function bodies, computed side by side)
  const emails = (await q(`select distinct lower(email) e from public.event_members where email is not null`)).map(x => x.e).concat(['admin@test.local', 'nobody@test.local']);
  let diffs = 0, checked = 0;
  for (const em of emails) {
    const claims = { sub: crypto.randomUUID(), email: em, role: 'authenticated' };
    const r2 = await as('postgres', claims, `select count(*)::int n,
      count(*) filter (where public.event_role(e.id) is distinct from o.er)::int d1,
      count(*) filter (where public._v2_role(e.id) is distinct from o.v2)::int d2,
      count(*) filter (where public.member_side(e.id) is distinct from o.side)::int d3,
      count(*) filter (where public._v2_host_side(e.id) is distinct from o.side)::int d4,
      count(*) filter (where public.can_host(e.id) is distinct from coalesce(public.is_admin() or o.er = 'host', false))::int d5,
      count(*) filter (where public.can_door(e.id) is distinct from coalesce(public.is_admin() or o.er in ('host','door'), false))::int d6
      from public.events e cross join lateral (select
        (select m.role from public.event_members m where m.event_id = e.id and lower(m.email) = public.current_email()
           and (m.role <> 'door' or m.expires_at is null or m.expires_at > now()) limit 1) er,
        case when public.is_admin() then 'admin' else (select case when bool_or(m.role = 'host') then 'host'
           when bool_or(m.role = 'door' and (m.expires_at is null or m.expires_at > now())) then 'door' end
           from public.event_members m where m.event_id = e.id and lower(m.email) = public._v2_email() and public._v2_email() <> '') end v2,
        case when public.is_admin() then null else (select nullif(trim(m.side), '') from public.event_members m
           where m.event_id = e.id and lower(m.email) = public.current_email() and m.role = 'host' limit 1) end side) o`);
    const x = r2.rows[0]; checked += x.n; diffs += x.d1 + x.d2 + x.d3 + x.d4 + x.d5 + x.d6;
  }
  ok(checked > 50 && diffs === 0, T(`email users: event_role, _v2_role, member_side, _v2_host_side, can_host, can_door all give the old answers (${checked} user/event pairs, ${diffs} differences)`));

  // ---------- 2. who may call what ----------
  const fns = await q(`select p.oid::regprocedure::text sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname in ('create_event_v2','update_event_v2','my_events_v2','list_members_v2','add_member_v2','remove_member_v2',
      'cohost_guests_v2','quote_v2','start_checkout_v2','request_change_v2','request_design_v2','approve_design_v2','event_orders_v2','event_requests_v2',
      'order_status_v2','preview_invite_v2','my_invites_v2','my_profile_v2','save_profile_v2','invite_send_status_v2','admin_orders_v2','admin_requests_v2',
      'admin_set_request_v2','admin_set_package_v2','admin_mark_paid_v2','invite_send_claim','invite_send_result','invite_send_status_update')
      or (p.proname like '\\_v2\\_%' and p.oid > (select oid from pg_proc where proname = '_v2_pass_settings_log' limit 1)))`);
  const exec = async (role, sig) => (await one(`select has_function_privilege($1, $2, 'execute') x`, [role, sig])).x;
  const anonOpen = [], appOpen = [];
  for (const f of fns) {
    if (f.proname === '_v2_norm_phone') continue;
    if (await exec('anon', f.sig)) anonOpen.push(f.sig);
    if (/^_v2_|^invite_send_(claim|result|status_update)$/.test(f.proname) && await exec('authenticated', f.sig)) appOpen.push(f.sig);
  }
  ok(fns.length >= 35 && anonOpen.length === 0, T(`logged-out visitors can run none of the ${fns.length} new functions (${anonOpen.join(', ')})`));
  ok(appOpen.length === 0, T(`the app cannot run internal or server-only functions (${appOpen.join(', ')})`));
  ok(await exec('service_role', 'public._v2_mark_paid(uuid,text,text)') && await exec('service_role', 'public.invite_send_claim(integer)'), T('the server (service key) can mark orders paid and claim invites'));
  for (const t of ['orders', 'change_requests', 'design_requests', 'profiles', 'invite_sends']) {
    const rls = (await one(`select relrowsecurity r, (select count(*)::int from pg_policies where tablename = $1) n from pg_class where oid = ('public.' || $1)::regclass`, [t]));
    ok(rls.r && rls.n === 0, T(`${t}: row security on, no policies`));
  }

  // ---------- 3. creating an event ----------
  ok(/permission denied/.test(await err(anon(`public.create_event_v2('{}'::jsonb)`))), T('logged-out visitors cannot create an event'));
  const E = await val(H, `public.create_event_v2($1::jsonb)`, [JSON.stringify({ title: 'Sara & Fahad', venue: 'Bayan Palace', lang: 'en', send_channel: 'whatsapp', invite_limit: 5, status: 'active', created_by: X.sub })]);
  let ev = await one(`select * from public.events where id = $1`, [E]);
  ok(ev.status === 'draft' && ev.invite_limit === 400 && ev.created_by === H.sub && ev.public_code.length >= 8 && ev.title === 'Sara & Fahad' && ev.venue === 'Bayan Palace' && ev.lang === 'en' && ev.send_channel === 'whatsapp',
    T('create_event_v2: a draft with 400 invites, the caller as creator, a public code, the given details (status, limit and creator can\'t be set)'));
  let mem = await q(`select * from public.event_members where event_id = $1`, [E]);
  ok(mem.length === 1 && mem[0].role === 'host' && mem[0].email === 'sshost@test.local' && mem[0].user_id === H.sub, T('create_event_v2: the caller becomes its host (email and user id)'));
  const EP = await val(P, `public.create_event_v2($1::jsonb)`, [JSON.stringify({})]);
  mem = await q(`select * from public.event_members where event_id = $1`, [EP]);
  ev = await one(`select * from public.events where id = $1`, [EP]);
  ok(mem.length === 1 && mem[0].email === null && mem[0].phone === '96599887766' && mem[0].user_id === P.sub && ev.title === 'مناسبة جديدة', T('a phone-only user can create an event; host row has their phone, no email; a default Arabic title'));
  const many = await mk('many@test.local');
  for (let i = 0; i < 20; i++) await val(many, `public.create_event_v2('{"title":"d"}'::jsonb)`);
  ok(/TOO_MANY_DRAFTS/.test(await err(val(many, `public.create_event_v2('{"title":"d21"}'::jsonb)`))), T('at most 20 drafts per user'));

  // ---------- 4. editing ----------
  let j = await val(H, `public.update_event_v2($1, $2::jsonb)`, [E, JSON.stringify({ headline: 'Our wedding', theme_accent: '#112233', design_style: 'classic', package: 'plus', door_addon: true, invite_limit: 9999, status: 'active', paid_at: '2020-01-01' })]);
  ok(j.headline === 'Our wedding' && j.theme_accent === '#112233' && j.design_style === 'classic' && j.package === 'plus' && j.door_addon === true && j.invite_limit === 400 && j.status === 'draft' && j.paid_at === null,
    T('update_event_v2: allowed keys change, package/door allowed in a draft; invite_limit, status and paid_at are ignored'));
  ok(/BAD_PACKAGE/.test(await err(val(H, `public.update_event_v2($1, '{"package":"gold"}'::jsonb)`, [E]))), T('update_event_v2: an unknown package is refused'));
  ok(/BAD_CHANNEL/.test(await err(val(H, `public.update_event_v2($1, '{"send_channel":"pigeon"}'::jsonb)`, [E]))), T('update_event_v2: an unknown send channel is refused'));
  for (const [w, n] of [[X, 'a stranger'], [P, 'another event\'s host'], [A, null]]) {
    if (!n) continue;
    ok(/Not allowed/.test(await err(val(w, `public.update_event_v2($1, '{"title":"x"}'::jsonb)`, [E]))), T(`update_event_v2: ${n} is refused`));
  }
  j = await val(A, `public.update_event_v2($1, '{"note":"admin note"}'::jsonb)`, [E]); ok(j.note === 'admin note', T('update_event_v2: an admin may edit'));
  ok((await val(P, `public.update_event_v2($1, '{"venue":"Diwan"}'::jsonb)`, [EP])).venue === 'Diwan', T('update_event_v2: a phone-only host edits their event'));

  // ---------- 5. team ----------
  ok(/permission denied/.test(await err(anon(`public.add_member_v2($1,'x','96555500001',null,'cohost')`, [E]))), T('add_member_v2: logged-out visitors refused'));
  const mCo = await val(H, `public.add_member_v2($1, 'Mum', '+965 5550 0001', null, 'cohost')`, [E]);
  ok(mCo.role === 'cohost' && mCo.phone === '96555500001' && mCo.email === null && mCo.name === 'Mum', T('add_member_v2: a co-host by phone (normalised to digits)'));
  const mD = await val(H, `public.add_member_v2($1, 'Door', null, 'SSDoor@test.local', 'door')`, [E]);
  ok(mD.role === 'door' && mD.email === 'ssdoor@test.local', T('add_member_v2: door staff by email'));
  ok(/ALREADY_MEMBER/.test(await err(val(H, `public.add_member_v2($1, 'Again', '٥٥٥٠٠٠٠١', null, 'door')`, [E]))), T('add_member_v2: the same phone twice is refused (Arabic digits too)'));
  ok(/BAD_ROLE/.test(await err(val(H, `public.add_member_v2($1, 'X', '96511122233', null, 'host')`, [E]))), T('add_member_v2: only cohost or door'));
  ok(/PHONE_OR_EMAIL_REQUIRED/.test(await err(val(H, `public.add_member_v2($1, 'X', null, null, 'door')`, [E]))), T('add_member_v2: needs a phone or an email'));
  ok(/BAD_PHONE/.test(await err(val(H, `public.add_member_v2($1, 'X', '123', null, 'door')`, [E]))), T('add_member_v2: a bad phone is refused'));
  for (const [w, n] of [[CO, 'the co-host'], [D, 'door staff'], [X, 'a stranger']]) {
    ok(/Not allowed/.test(await err(val(w, `public.add_member_v2($1, 'X', '96511122244', null, 'door')`, [E]))), T(`add_member_v2: ${n} is refused`));
    ok(/Not allowed/.test(await err(val(w, `public.list_members_v2($1)`, [E]))), T(`list_members_v2: ${n} is refused`));
  }
  j = await val(H, `public.list_members_v2($1)`, [E]);
  ok(j.length === 3 && j[0].role === 'host' && j[0].is_me === true && j.find(m => m.role === 'cohost').is_me === false, T('list_members_v2: host first, marks the caller'));
  const tmp = await val(H, `public.add_member_v2($1, 'Temp', '96511122255', null, 'door')`, [E]);
  ok(/Not allowed/.test(await err(val(CO, `public.remove_member_v2($1)`, [tmp.id]))), T('remove_member_v2: the co-host is refused'));
  ok((await val(H, `public.remove_member_v2($1)`, [tmp.id])).ok === true && !(await one(`select 1 x from public.event_members where id = $1`, [tmp.id])), T('remove_member_v2: the host removes door staff'));
  const hostRow = (await one(`select id from public.event_members where event_id = $1 and role = 'host'`, [E])).id;
  ok(/CANNOT_REMOVE_HOST/.test(await err(val(H, `public.remove_member_v2($1)`, [hostRow]))), T('remove_member_v2: a host row can\'t be removed'));

  // ---------- 6. guests, and what each role sees ----------
  await call(H, `insert into public.guests(event_id, name, phone, seats) values ($1,'Noura','96550001111',3),($1,'Hamad','96550002222',2),($1,'Guest Acc','5666 0001',1)`, [E]);
  ok((await one(`select count(*)::int n from public.guests where event_id = $1`, [E])).n === 3, T('the host adds guests to the draft directly (row rules match by email as before)'));
  await call(P, `insert into public.guests(event_id, name, phone, seats) values ($1,'Phone Host Guest','96550003333',1)`, [EP]);
  ok((await call(P, `select count(*)::int n from public.guests where event_id = $1`, [EP])).rows[0].n === 1, T('a phone-only host reads and writes their guests (row rules match by phone)'));
  ok((await call(P, `select count(*)::int n from public.guests where event_id = $1`, [E])).rows[0].n === 0, T('a phone-only host sees no other event\'s guests'));
  ok(await val(P, `public.can_host($1)`, [EP]) === true && await val(P, `public.can_host($1)`, [E]) === false && await val(CO, `public.can_host($1)`, [E]) === false && await val(CO, `public.can_door($1)`, [E]) === false,
    T('can_host / can_door: phone host yes on their event; a co-host is neither host nor door'));
  const tokE = (await one(`select token from public.guests where event_id = $1 and name = 'Noura'`, [E])).token;
  const phonesE = (await q(`select phone from public.guests where event_id = $1`, [E])).map(x => x.phone);
  const tokensE = (await q(`select token from public.guests where event_id = $1`, [E])).map(x => x.token);
  const leaks = s => phonesE.some(p => s.includes(p)) || tokensE.some(t => s.includes(t));

  // co-host: names, party sizes and replies only
  r = await call(CO, `select * from public.cohost_guests_v2($1)`, [E]);
  ok(r.rows.length === 3 && r.fields.map(f => f.name).join() === 'id,name,seats,status,confirmed_count,checked_in_count,side,responded_at' && !leaks(JSON.stringify(r.rows)),
    T('cohost_guests_v2: the co-host gets names, seats and replies, never phones or tokens'));
  ok((await call(CO, `select count(*)::int n from public.guests`)).rows[0].n === 0 && (await call(CO, `select count(*)::int n from public.events where id = $1`, [E])).rows[0].n === 0,
    T('the co-host cannot read guests or the event row directly'));
  const coBlocked = [];
  for (const s of [`(select json_agg(x) from public.door_list_v2($1) x)`, `public.door_pass_lookup_v2($1, 'x')`, `public.list_members_v2($1)`, `public.quote_v2($1,'plus',false)`, `public.event_orders_v2($1)`,
                   `public.pass_send_status_v2($1)`, `(select json_agg(x) from public.audit_log_v2($1) x)`, `(select json_agg(x) from public.list_exceptions_v2($1) x)`, `public.invite_send_status_v2($1)`]) {
    if (!/Not allowed/.test(await err(val(CO, s, [E])))) coBlocked.push(s);
  }
  ok(coBlocked.length === 0, T(`the co-host is refused by every call that shows phones, tokens, money or the door list (${coBlocked.join(' | ')})`));
  const gid = (await one(`select id from public.guests where event_id = $1 and name = 'Hamad'`, [E])).id;
  ok(/Not allowed/.test(await err(val(CO, `public.host_set_reply_v2($1,'yes',1)`, [gid]))) && /Not allowed/.test(await err(val(CO, `public.check_in_v2($1, 1)`, [gid]))), T('the co-host cannot change replies or check guests in'));
  j = await val(CO, `public.preview_invite_v2($1)`, [E]);
  ok(j.preview === true && j.token === null && j.event.title === 'Sara & Fahad' && j.name === 'Our guest', T('preview_invite_v2: the co-host previews the invite with a sample guest (no token)'));
  j = await val(CO, `public.my_events_v2()`);
  const coEv = j.find(x => x.id === E);
  ok(coEv && coEv.role === 'cohost' && coEv.counts.invited === 3 && coEv.counts.invited_people === 6 && !leaks(JSON.stringify(j)), T('my_events_v2: the co-host sees the event with counts, no phones or tokens'));
  ok(/Not allowed/.test(await err(val(X, `public.preview_invite_v2($1)`, [E]))) && /Not allowed/.test(await err(val(D, `public.preview_invite_v2($1)`, [E]))), T('preview_invite_v2: strangers and door staff refused'));

  // my_events_v2
  j = await val(H, `public.my_events_v2()`);
  const hEv = j.find(x => x.id === E);
  ok(hEv && hEv.role === 'host' && hEv.status === 'draft' && hEv.package === 'plus' && hEv.door === true && hEv.counts.no_reply === 3 && hEv.counts.yes_people === 0 && hEv.counts.arrived === 0,
    T('my_events_v2: role, status, package, door (from the package), counts'));
  ok(!j.some(x => x.id === EP), T('my_events_v2: only the caller\'s events'));
  ok((await val(D, `public.my_events_v2()`)).find(x => x.id === E)?.role === 'door', T('my_events_v2: door staff see the event as door'));
  ok(/permission denied/.test(await err(anon(`public.my_events_v2()`))), T('my_events_v2: logged-out visitors refused'));

  // ---------- 7. a draft is closed to guests and the door ----------
  const code = (await one(`select public_code from public.events where id = $1`, [E])).public_code;
  const before = (await one(`select count(*)::int n from public.guests where event_id = $1`, [E])).n;
  j = await anon(`public.get_invite_v2($1)`, [tokE]); ok(j && j.closed === 'not_ready' && !leaks(JSON.stringify(j)), T('draft: get_invite_v2 for a guest → {closed:"not_ready"}'));
  j = await anon(`public.public_rsvp_v2($1,'Link Guest','yes',null,null)`, [code]);
  ok(j.closed === 'not_ready' && (await one(`select count(*)::int n from public.guests where event_id = $1`, [E])).n === before, T('draft: public_rsvp_v2 → {closed:"not_ready"} and no guest is added'));
  ok((await anon(`public.get_event_public_v2($1)`, [code])).closed === 'not_ready', T('draft: get_event_public_v2 → {closed:"not_ready"}'));
  ok(/NOT_READY/.test(await err(anon(`public.respond_v2($1,'yes',1,null)`, [tokE]))), T('draft: respond_v2 refuses with NOT_READY'));
  ok(/NOT_READY/.test(await err(call(D, `select * from public.door_list_v2($1)`, [E]))), T('draft: door_list_v2 refuses door staff with NOT_READY'));
  ok((await call(H, `select * from public.door_list_v2($1)`, [E])).rows.length === 3, T('draft: the host still sees the door list'));
  j = await val(H, `public.get_invite_v2($1)`, [tokE]); ok(j.name === 'Noura' && j.event.title === 'Sara & Fahad', T('draft: the host previews a guest\'s invite'));
  j = await val(CO, `public.get_invite_v2($1)`, [tokE]); ok(j.name === 'Noura', T('draft: the co-host previews it too'));
  ok((await val(X, `public.get_invite_v2($1)`, [tokE])).closed === 'not_ready' && (await val(D, `public.get_invite_v2($1)`, [tokE])).closed === 'not_ready', T('draft: a stranger or door staff signed in still get not_ready'));
  // an active event is unchanged
  const legacyTok = (await one(`select g.token from public.guests g join public.events e on e.id = g.event_id where e.title = 'Legacy party' limit 1`)).token;
  j = await anon(`public.get_invite_v2($1)`, [legacyTok]); ok(j && j.name && !('closed' in j), T('active: guests of existing events see their invite as before'));

  // ---------- 8. prices are worked out on the server ----------
  for (let i = 0; i < 24; i++) await q(`insert into public.guests(event_id, name, seats) values ($1, $2, 2)`, [E, 'Bulk ' + i]);   // 6 + 48 = 54 seats
  j = await val(H, `public.quote_v2($1,'basic',true)`, [E]);
  ok(j.total_fils === 25000 && j.items.length === 2 && j.items[1].kind === 'door_addon' && j.items[1].amount_fils === 10000 && j.guest_count === 54 && j.fits === false,
    T('quote_v2: Basic + door = 15 + 10 KWD; 54 invites don\'t fit Basic (fits false)'));
  ok(j.items[0].label_en === 'Basic' && j.items[0].label_ar && j.items[1].label_ar, T('quote_v2: every line has an English and Arabic label'));
  j = await val(H, `public.quote_v2($1,'plus',true)`, [E]);
  ok(j.total_fils === 35000 && j.items.length === 1 && j.fits === true && j.door === true, T('quote_v2: Plus includes the door, so no add-on line'));
  j = await val(H, `public.quote_v2($1,'premium',false)`, [E]); ok(j.total_fils === 75000, T('quote_v2: Premium 75 KWD'));
  ok(/BAD_PACKAGE/.test(await err(val(H, `public.quote_v2($1,'free',false)`, [E]))), T('quote_v2: unknown package refused'));
  ok(/PACKAGE_TOO_SMALL/.test(await err(val(H, `public.start_checkout_v2($1,'basic',false,'knet')`, [E]))), T('start_checkout_v2: refuses a package smaller than the guest list'));
  ok(/BAD_METHOD/.test(await err(val(H, `public.start_checkout_v2($1,'plus',false,'free')`, [E]))), T('start_checkout_v2: only knet or card'));
  for (const [w, n] of [[CO, 'co-host'], [D, 'door staff'], [X, 'stranger']]) ok(/Not allowed/.test(await err(val(w, `public.start_checkout_v2($1,'plus',false,'knet')`, [E]))), T(`start_checkout_v2: ${n} refused`));
  // a client cannot set the price: no amount argument exists, and the tables are closed
  ok(/permission denied|row-level security/.test(await err(call(H, `insert into public.orders(event_id, kind, amount_fils, status) values ($1, 'package', 1, 'paid')`, [E]))), T('the app cannot write an order itself'));
  ok((await call(H, `update public.prices set price_fils = 1 returning *`).then(x => x.rowCount === 0, () => true)) && (await one(`select price_fils from public.prices where code='design'`)).price_fils === 15000, T('the app cannot change prices'));
  ok((await call(H, `update public.packages set price_fils = 1 returning *`).then(x => x.rowCount === 0, () => true)) && (await one(`select price_fils from public.packages where code='plus'`)).price_fils === 35000, T('the app cannot change packages'));
  ok((await as('anon', {}, `select count(*)::int n from public.packages`)).rows[0].n === 3 && (await as('anon', {}, `select count(*)::int n from public.prices`)).rows[0].n === 3, T('everyone can read the packages and prices'));
  const ord = await val(H, `public.start_checkout_v2($1,'plus',true,'knet')`, [E]);
  let o = await one(`select * from public.orders where id = $1`, [ord]);
  ok(o.amount_fils === 35000 && o.status === 'pending' && o.kind === 'package' && o.package === 'plus' && o.door === false && o.method === 'knet' && o.created_by === H.sub, T('start_checkout_v2: a pending package order for the server\'s amount'));
  await q(`update public.prices set price_fils = 12000 where code = 'door_addon'`);
  ok((await val(H, `public.quote_v2($1,'basic',true)`, [E])).total_fils === 27000, T('quote_v2 follows the price table, not the app'));
  await q(`update public.prices set price_fils = 10000 where code = 'door_addon'`);
  j = await val(H, `public.order_status_v2($1)`, [ord]); ok(j.status === 'pending' && j.amount_fils === 35000 && j.event_title === 'Sara & Fahad', T('order_status_v2: the host sees the order'));
  ok(/Not allowed/.test(await err(val(CO, `public.order_status_v2($1)`, [ord]))) && /Not allowed/.test(await err(val(X, `public.order_status_v2($1)`, [ord]))), T('order_status_v2: co-host and strangers refused'));
  ok(/IS_DRAFT/.test(await err(val(H, `public.request_change_v2($1,'x',null,null,null,'knet')`, [E]))), T('request_change_v2: a draft is changed for free, not through a paid request'));

  // ---------- 9. paying ----------
  ok(/permission denied/.test(await err(val(H, `public._v2_mark_paid($1,'test','x')`, [ord]))) && /permission denied/.test(await err(anon(`public._v2_mark_paid($1,'test','x')`, [ord]))), T('_v2_mark_paid: the app and visitors cannot call it'));
  j = await svc(`public._v2_mark_paid($1,'test','ref-1')`, [ord]);
  ev = await one(`select * from public.events where id = $1`, [E]); o = await one(`select * from public.orders where id = $1`, [ord]);
  ok(j.already === false && o.status === 'paid' && o.gateway === 'test' && o.gateway_ref === 'ref-1' && o.paid_at && ev.status === 'active' && ev.package === 'plus' && ev.invite_limit === 150 && ev.door_addon === false && ev.paid_at,
    T('_v2_mark_paid: order paid; event active with the package, its invite limit and the paid time'));
  const paidAt = ev.paid_at.toISOString(), logsN = (await one(`select count(*)::int n from public.audit_logs where action = 'order_paid' and details->>'order' = $1`, [ord])).n;
  j = await svc(`public._v2_mark_paid($1,'test','ref-2')`, [ord]);
  ev = await one(`select * from public.events where id = $1`, [E]); o = await one(`select * from public.orders where id = $1`, [ord]);
  ok(j.already === true && o.gateway_ref === 'ref-1' && ev.paid_at.toISOString() === paidAt && logsN === 1 && (await one(`select count(*)::int n from public.audit_logs where action = 'order_paid' and details->>'order' = $1`, [ord])).n === 1,
    T('_v2_mark_paid is idempotent: a second call changes nothing and logs nothing'));
  ok(/NOT_DRAFT/.test(await err(val(H, `public.start_checkout_v2($1,'premium',false,'knet')`, [E]))) && /NOT_DRAFT/.test(await err(val(H, `public.update_event_v2($1,'{"package":"basic"}'::jsonb)`, [E]))), T('after payment the package can\'t be changed by the host'));
  j = await anon(`public.get_invite_v2($1)`, [tokE]); ok(j.name === 'Noura' && !('closed' in j), T('active: the guest now sees the invite'));
  j = await anon(`public.public_rsvp_v2($1,'Link Guest','yes',null,null)`, [code]); ok(j.status === 'yes' && j.name === 'Link Guest', T('active: the shared link works'));
  ok((await call(D, `select * from public.door_list_v2($1)`, [E])).rows.length >= 28, T('active: the door list opens for door staff'));

  // ---------- 10. changes after sending ----------
  j = await val(H, `public.request_change_v2($1,'New time','Starts 8pm',null,array['https://x/p.jpg'],'card')`, [E]);
  let cr = await one(`select * from public.change_requests where id = $1`, [j.request_id]); o = await one(`select * from public.orders where id = $1`, [j.order_id]);
  ok(cr.status === 'awaiting_payment' && cr.order_id === o.id && o.kind === 'invite_change' && o.amount_fils === 10000 && o.status === 'pending' && o.related_id === cr.id && cr.photos.length === 1,
    T('request_change_v2: a request awaiting payment and a pending 10 KWD order'));
  ok(/Not allowed/.test(await err(val(CO, `public.request_change_v2($1,'x',null,null,null,'knet')`, [E]))), T('request_change_v2: the co-host is refused'));
  await svc(`public._v2_mark_paid($1,'test','r')`, [o.id]);
  ok((await one(`select status from public.change_requests where id = $1`, [cr.id])).status === 'requested', T('_v2_mark_paid: a paid change → requested'));
  const failOrd = (await val(H, `public.request_change_v2($1,'Other',null,null,null,'knet')`, [E])).order_id;
  j = await svc(`public._v2_mark_failed($1,'test','r')`, [failOrd]);
  ok(j.status === 'failed' && (await one(`select status from public.orders where id = $1`, [failOrd])).status === 'failed', T('_v2_mark_failed: a refused payment → failed'));
  ok((await svc(`public._v2_mark_paid($1,'test','r')`, [failOrd])).status === 'paid', T('a payment that arrives after a failure still counts'));

  // ---------- 11. design ----------
  const dr = await val(H, `public.request_design_v2($1,'Gold and white','Wording',null,null)`, [E]);
  ok((await one(`select status, order_id from public.design_requests where id = $1`, [dr])).status === 'requested', T('request_design_v2: requested, no order yet'));
  ok(/NO_DRAFT_YET/.test(await err(val(H, `public.approve_design_v2($1,'knet')`, [dr]))), T('approve_design_v2: nothing to approve before the team sends a draft'));
  ok(/Not allowed/.test(await err(val(H, `public.admin_set_request_v2('design',$1,'draft_sent','https://x/draft.jpg')`, [dr]))), T('admin_set_request_v2: hosts refused'));
  j = await val(A, `public.admin_set_request_v2('design',$1,'draft_sent','https://x/draft.jpg')`, [dr]); ok(j.status === 'draft_sent' && j.draft_url === 'https://x/draft.jpg', T('admin_set_request_v2: the team sends the draft'));
  const dOrd = await val(H, `public.approve_design_v2($1,'knet')`, [dr]);
  o = await one(`select * from public.orders where id = $1`, [dOrd]);
  ok(o.kind === 'design' && o.amount_fils === 15000 && o.status === 'pending', T('approve_design_v2 on Plus: a pending 15 KWD design order'));
  ok((await val(H, `public.approve_design_v2($1,'knet')`, [dr])) === dOrd, T('approve_design_v2 twice gives the same order back'));
  await svc(`public._v2_mark_paid($1,'test','r')`, [dOrd]);
  ok((await one(`select status from public.design_requests where id = $1`, [dr])).status === 'approved', T('_v2_mark_paid: a paid design → approved'));
  // Premium includes design: 0 and paid at once
  const EPr = await val(H2, `public.create_event_v2('{"title":"Premium party","package":"premium"}'::jsonb)`);
  const pOrd = await val(H2, `public.start_checkout_v2($1,'premium',false,'card')`, [EPr]);
  await svc(`public._v2_mark_paid($1,'test','r')`, [pOrd]);
  const dr2 = await val(H2, `public.request_design_v2($1,'Idea',null,null,null)`, [EPr]);
  await val(A, `public.admin_set_request_v2('design',$1,'draft_sent',null)`, [dr2]);
  const dOrd2 = await val(H2, `public.approve_design_v2($1,null)`, [dr2]);
  o = await one(`select * from public.orders where id = $1`, [dOrd2]);
  ok(o.amount_fils === 0 && o.status === 'paid' && o.gateway === 'included' && (await one(`select status from public.design_requests where id = $1`, [dr2])).status === 'approved', T('approve_design_v2 on Premium: 0, paid at once, approved'));
  ok((await one(`select invite_limit from public.events where id = $1`, [EPr])).invite_limit === 400, T('Premium: 400 invites'));
  // a free design in a draft is charged if the host then picks a package without design
  const EDf = await val(H2, `public.create_event_v2('{"title":"Switcher","package":"premium"}'::jsonb)`);
  const dr3 = await val(H2, `public.request_design_v2($1,'Idea',null,null,null)`, [EDf]);
  await val(A, `public.admin_set_request_v2('design',$1,'draft_sent',null)`, [dr3]);
  await val(H2, `public.approve_design_v2($1,null)`, [dr3]);
  j = await val(H2, `public.quote_v2($1,'plus',false)`, [EDf]);
  ok(j.total_fils === 50000 && j.items.some(i => i.kind === 'design' && i.amount_fils === 15000), T('quote_v2: switching from Premium after a free design adds the design (15 KWD)'));
  ok((await val(H2, `public.quote_v2($1,'premium',false)`, [EDf])).total_fils === 75000, T('quote_v2: staying on Premium keeps the design free'));

  j = await val(H, `public.event_orders_v2($1)`, [E]); ok(j.length === 4 && j.every(x => x.event_id === E), T('event_orders_v2: the host lists the event\'s orders'));
  j = await val(H, `public.event_requests_v2($1)`, [E]); ok(j.length === 3 && j.some(x => x.kind === 'design') && j.some(x => x.kind === 'change'), T('event_requests_v2: change and design requests'));
  ok(/Not allowed/.test(await err(val(CO, `public.event_requests_v2($1)`, [E]))) && /Not allowed/.test(await err(val(H2, `public.event_orders_v2($1)`, [E]))), T('orders and requests: co-host and other hosts refused'));

  // ---------- 12. admin ----------
  for (const s of [`public.admin_orders_v2(null)`, `public.admin_requests_v2()`, `public.admin_set_package_v2('${E}','premium',false)`, `public.admin_mark_paid_v2('${failOrd}','x')`]) {
    ok(/Not allowed/.test(await err(val(H, s))) && /permission denied/.test(await err(anon(s))), T(`${s.split('(')[0].replace('public.', '')}: hosts and visitors refused`));
  }
  const EM = await val(H2, `public.create_event_v2('{"title":"Cash"}'::jsonb)`);
  const mOrd = await val(H2, `public.start_checkout_v2($1,'basic',true,'knet')`, [EM]);
  j = await val(A, `public.admin_orders_v2('pending')`); ok(j.length >= 1 && j.every(x => x.status === 'pending') && j[0].event_title && j[0].host, T('admin_orders_v2: filter by status, with event title and host'));
  j = await val(A, `public.admin_requests_v2()`); ok(j.length >= 4 && j.every(x => x.event_title && x.host), T('admin_requests_v2: design and change requests with event title and host'));
  j = await val(A, `public.admin_mark_paid_v2($1,'paid cash')`, [mOrd]);
  o = await one(`select * from public.orders where id = $1`, [mOrd]); ev = await one(`select * from public.events where id = $1`, [EM]);
  ok(j.status === 'paid' && o.gateway === 'manual' && /paid cash/.test(o.gateway_ref) && o.amount_fils === 25000 && ev.status === 'active' && ev.package === 'basic' && ev.door_addon === true && ev.invite_limit === 50,
    T('admin_mark_paid_v2: the team marks an order paid by hand (gateway manual); Basic + door opens with 50 invites'));
  j = await val(A, `public.admin_set_package_v2($1,'plus',true)`, [EM]); ok(j.package === 'plus' && j.door_addon === false && j.invite_limit === 150, T('admin_set_package_v2: fixes the package by hand'));
  j = await val(A, `public.admin_set_request_v2('change',$1,'done')`, [cr.id]); ok(j.status === 'done' && j.done_at, T('admin_set_request_v2: a change is done'));
  ok(/BAD_STATUS/.test(await err(val(A, `public.admin_set_request_v2('change',$1,'shipped')`, [cr.id]))), T('admin_set_request_v2: wrong status refused'));

  // ---------- 13. guests with an account ----------
  const past = await one(`insert into public.events(title, starts_at, status) values ('Past party', now() - interval '10 days', 'active') returning id`);
  const soon = await one(`insert into public.events(title, starts_at) values ('Soon party', now() + interval '3 days') returning id`);
  const later = await one(`insert into public.events(title, starts_at) values ('Later party', now() + interval '30 days') returning id`);
  const drafty = await one(`insert into public.events(title, starts_at, status) values ('Draft party', now() + interval '5 days', 'draft') returning id`);
  await q(`insert into public.guests(event_id, name, phone, seats) values ($1,'Me',' +965 6660 0001',2),($2,'Me','96566600001',1),($3,'Me','٦٦٦٠٠٠٠١',1),($4,'Me','96566600001',1),($2,'Someone','96566600002',1)`, [past.id, soon.id, later.id, drafty.id]);
  j = await val(G, `public.my_invites_v2()`);
  ok(j.length === 3, T(`my_invites_v2: the caller's invites in any phone format, drafts left out (${j.length})`));
  const titles = j.map(x => x.event.title);
  ok(titles.indexOf('Soon party') < titles.indexOf('Later party') && titles[titles.length - 1] === 'Past party' && j.find(x => x.event.title === 'Past party').past === true && j[0].past === false,
    T(`my_invites_v2: upcoming first (soonest first), then past (${titles.join(', ')})`));
  ok(!titles.includes('Draft party') && j.every(x => x.token && 'seats' in x && 'status' in x && 'confirmed_count' in x && 'responded_at' in x && 'venue' in x.event && 'card_image_url' in x.event && 'lang' in x.event), T('my_invites_v2: each item has the token, reply and event details'));
  ok(!JSON.stringify(j).includes('96566600002') && !JSON.stringify(j).includes('Someone'), T('my_invites_v2: never someone else\'s invite'));
  ok((await val(H, `public.my_invites_v2()`)).length === 0, T('my_invites_v2: an email login (no phone) gets an empty list'));
  ok(/permission denied/.test(await err(anon(`public.my_invites_v2()`))), T('my_invites_v2: logged-out visitors refused'));
  j = await val(G, `public.save_profile_v2('Ghala','Ghala@Example.com')`);
  ok(j.name === 'Ghala' && j.phone === '96566600001' && j.email === 'ghala@example.com', T('save_profile_v2 / my_profile_v2: name, phone from the login, email'));
  ok((await val(G, `public.my_profile_v2()`)).name === 'Ghala', T('my_profile_v2 reads it back'));
  ok(/BAD_EMAIL/.test(await err(val(G, `public.save_profile_v2('G','not-an-email')`))), T('save_profile_v2: a bad email is refused'));
  await val(G, `public.save_profile_v2('G','sshost@test.local')`);
  ok(/Not allowed/.test(await err(val(G, `public.update_event_v2($1,'{"title":"x"}'::jsonb)`, [E]))) && (await val(G, `public.can_host($1)`, [E])) === false, T('a profile email gives no access: only the login\'s own email or phone counts'));

  // ---------- 14. invites on WhatsApp ----------
  await val(H, `public.update_event_v2($1, '{"send_channel":"by_hand"}'::jsonb)`, [E]);   // only W sends by WhatsApp below
  const W = await val(H2, `public.create_event_v2('{"title":"WA party","send_channel":"whatsapp"}'::jsonb)`);
  await q(`update public.events set starts_at = now() + interval '7 days' where id = $1`, [W]);
  await call(H2, `insert into public.guests(event_id, name, phone, seats) values ($1,'Wa One','96551110001',1),($1,'Wa Two','+965 5111 0002',2),($1,'No Phone',null,1),($1,'By Hand','96551110004',1),($1,'Replied','96551110005',1),($1,'Bad','123',1)`, [W]);
  await q(`update public.guests set sent_at = now() where event_id = $1 and name = 'By Hand'`, [W]);
  await q(`update public.guests set status = 'yes', confirmed_count = 1 where event_id = $1 and name = 'Replied'`, [W]);
  const claimI = async () => (await as('service_role', {}, `select * from public.invite_send_claim(100)`)).rows;
  ok((await claimI()).length === 0, T('invites: nothing is claimed while the event is a draft (not paid)'));
  const wOrd = await val(H2, `public.start_checkout_v2($1,'basic',false,'knet')`, [W]);
  await svc(`public._v2_mark_paid($1,'test','r')`, [wOrd]);
  ok(/permission denied/.test(await err(call(H2, `select * from public.invite_send_claim(10)`))), T('invites: the app cannot claim invites'));
  // by-hand events (all existing ones) are never claimed: checked by the claim only returning W's guests
  const handlerTests = await import(require('path').join(repo, 'supabase/functions/_shared/invites.ts'));
  const passMod = await import(require('path').join(repo, 'supabase/functions/_shared/pass.ts'));
  const payMod = await import(require('path').join(repo, 'supabase/functions/_shared/pay.ts'));
  const rpcAs = (role, claims) => async (fn, args) => {
    const keys = Object.keys(args);
    try {
      const [info] = await q(`select proretset from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [fn]);
      const callSql = `public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')})`;
      const rows = (await as(role, claims, info.proretset ? `select to_jsonb(x) j from ${callSql} x` : `select to_jsonb(${callSql}) j`, keys.map(k => args[k]))).rows;
      return { data: info.proretset ? rows.map(x => x.j) : rows[0].j, error: null };
    } catch (e) { return { data: null, error: { message: e.message } }; }
  };
  const srpc = rpcAs('service_role', {});
  const SECRET = 'test-cron-secret-0123456789';
  const post = (secret = SECRET) => new Request('https://x.test/functions/v1/send-invites', { method: 'POST', headers: { 'x-cron-secret': secret }, body: '{}' });
  const ilog = []; const log = (m, f) => ilog.push(JSON.stringify({ m, ...f }));
  let res = await handlerTests.handleInvitesRequest(post(), { CRON_SECRET: SECRET }, { rpc: srpc, log });
  ok(res.status === 200 && JSON.stringify(await res.json()) === '{"mode":"off"}' && (await one(`select count(*)::int n from public.invite_sends`)).n === 0, T('send-invites: off by default, claims nobody'));
  res = await handlerTests.handleInvitesRequest(post('wrong-secret-0123456789'), { CRON_SECRET: SECRET, INVITES_MODE: 'mock' }, { rpc: srpc, log });
  ok(res.status === 401, T('send-invites: a wrong x-cron-secret is refused'));
  const bodies = [];
  res = await handlerTests.handleInvitesRequest(post(), { CRON_SECRET: SECRET, INVITES_MODE: 'mock' }, { rpc: srpc, log, send: async b => { bodies.push(b); return passMod.mockSender(b); } });
  j = await res.json();
  ok(res.status === 200 && j.mode === 'mock' && j.claimed === 3 && j.sent === 2 && j.failed === 1, T(`send-invites mock: claims the 3 unsent, unreplied guests with a phone of the paid WhatsApp event; the bad phone fails (${JSON.stringify(j)})`));
  const wg = Object.fromEntries((await q(`select g.name, g.sent_at, s.status, s.provider_msg_id, s.last_error from public.guests g left join public.invite_sends s on s.guest_id = g.id where g.event_id = $1`, [W])).map(x => [x.name, x]));
  ok(wg['Wa One'].status === 'sent' && wg['Wa One'].sent_at && wg['Wa Two'].status === 'sent' && wg['Bad'].status === 'failed' && !wg['Bad'].sent_at && !wg['By Hand'].status && !wg['Replied'].status && !wg['No Phone'].status,
    T('send-invites: sent guests are marked sent (leave the hand list); failed, by-hand, replied and no-phone guests are not'));
  ok(bodies.every(b => b.template.name === 'sina_invite' && /^invite:/.test(b.biz_opaque_callback_data)) && bodies.map(b => b.to).sort().join() === '96551110001,96551110002', T('send-invites: the invite template, 965 numbers, tagged invite:<guest>'));
  const wTok = (await one(`select token from public.guests where event_id = $1 and name = 'Wa One'`, [W])).token;
  ok(!ilog.some(l => l.includes(wTok) || l.includes('96551110001') || l.includes('96551110002')), T('send-invites: no tokens or full phone numbers in the logs'));
  res = await handlerTests.handleInvitesRequest(post(), { CRON_SECRET: SECRET, INVITES_MODE: 'mock' }, { rpc: srpc, log });
  ok((await res.json()).claimed === 0, T('send-invites: a second run sends nothing again'));
  ok(!(await one(`select count(*)::int n from public.invite_sends s join public.events e on e.id = s.event_id where e.send_channel <> 'whatsapp'`)).n, T('send-invites: by-hand and SMS events are never sent'));
  // delivery news through whatsapp-webhook
  const APP = 'test-app-secret';
  const hookBody = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { statuses: [
    { id: wg['Wa One'].provider_msg_id, status: 'read', biz_opaque_callback_data: 'invite:' + (await one(`select id from public.guests where event_id = $1 and name = 'Wa One'`, [W])).id },
    { id: wg['Wa Two'].provider_msg_id, status: 'delivered' }] } }] }] });
  const sig = 'sha256=' + crypto.createHmac('sha256', APP).update(hookBody).digest('hex');
  res = await passMod.handleWebhookRequest(new Request('https://x.test/hook', { method: 'POST', headers: { 'x-hub-signature-256': sig }, body: hookBody }), { WHATSAPP_APP_SECRET: APP }, { rpc: srpc });
  j = await res.json();
  const after = Object.fromEntries((await q(`select g.name, s.status from public.guests g join public.invite_sends s on s.guest_id = g.id where g.event_id = $1`, [W])).map(x => [x.name, x.status]));
  ok(res.status === 200 && j.changed === 2 && after['Wa One'] === 'read' && after['Wa Two'] === 'delivered', T('whatsapp-webhook: invite delivery news updates invite_sends (tagged or not)'));
  j = await val(H2, `public.invite_send_status_v2($1)`, [W]);
  ok(j.counts.read === 1 && j.counts.delivered === 1 && j.counts.failed === 1 && j.channel === 'whatsapp', T('invite_send_status_v2: counts for the host'));

  // ---------- 15. checkout / checkout-test / payment-webhook ----------
  const tokens = { 'tok-h2': H2, 'tok-x': X, 'tok-co': CO };
  const deps = {
    userRpc: async (jwt, fn, args) => tokens[jwt] ? rpcAs('authenticated', tokens[jwt])(fn, args) : { data: null, error: { message: 'Invalid JWT' } },
    serviceRpc: srpc, log, ref: () => 'test-ref-1',
  };
  const EC = await val(H2, `public.create_event_v2('{"title":"Pay party"}'::jsonb)`);
  const cOrd = await val(H2, `public.start_checkout_v2($1,'plus',false,'knet')`, [EC]);
  const preq = (body, tok = 'tok-h2', url = 'https://x.test/checkout') => new Request(url, { method: 'POST', headers: tok ? { Authorization: 'Bearer ' + tok } : {}, body: JSON.stringify(body) });
  res = await payMod.handleCheckout(preq({ order_id: cOrd }), {}, deps);
  ok(res.status === 503 && (await res.json()).error === 'payments_not_connected', T('checkout: off (no PAYMENT_MODE) → 503 payments_not_connected'));
  res = await payMod.handleCheckout(preq({ order_id: cOrd }), { PAYMENT_MODE: 'live' }, deps);
  ok(res.status === 503, T('checkout: any mode but test → 503'));
  res = await payMod.handleCheckout(preq({ order_id: cOrd }), { PAYMENT_MODE: 'test' }, deps);
  j = await res.json();
  ok(res.status === 200 && j.url === 'https://snalawwad.github.io/RSVP/pay.html?order=' + cOrd && j.amount_fils === 35000, T('checkout: test mode → the pay.html link'));
  res = await payMod.handleCheckout(preq({ order_id: cOrd }), { PAYMENT_MODE: 'test', SITE_URL: 'https://example.test/site/' }, deps);
  ok((await res.json()).url === 'https://example.test/site/pay.html?order=' + cOrd, T('checkout: SITE_URL is used when set'));
  res = await payMod.handleCheckout(preq({ order_id: cOrd }, null), { PAYMENT_MODE: 'test' }, deps); ok(res.status === 401, T('checkout: no login → 401'));
  res = await payMod.handleCheckout(preq({ order_id: cOrd }, 'tok-bad'), { PAYMENT_MODE: 'test' }, deps); ok(res.status === 401, T('checkout: a bad login → 401'));
  res = await payMod.handleCheckout(preq({ order_id: cOrd }, 'tok-x'), { PAYMENT_MODE: 'test' }, deps); ok(res.status === 403, T('checkout: someone else\'s order → 403'));
  res = await payMod.handleCheckout(preq({ order_id: 'nope' }), { PAYMENT_MODE: 'test' }, deps); ok(res.status === 400, T('checkout: a bad order id → 400'));
  res = await payMod.handleCheckout(new Request('https://x.test/checkout', { method: 'GET' }), { PAYMENT_MODE: 'test' }, deps); ok(res.status === 405, T('checkout: GET → 405'));
  res = await payMod.handleCheckoutTest(preq({ order_id: cOrd, outcome: 'paid' }), {}, deps);
  ok(res.status === 403 && (await one(`select status from public.orders where id = $1`, [cOrd])).status === 'pending', T('checkout-test: off → 403 and the order stays pending'));
  res = await payMod.handleCheckoutTest(preq({ order_id: cOrd, outcome: 'paid' }, 'tok-co'), { PAYMENT_MODE: 'test' }, deps);
  ok(res.status === 403 && (await one(`select status from public.orders where id = $1`, [cOrd])).status === 'pending', T('checkout-test: not the host → 403'));
  res = await payMod.handleCheckoutTest(preq({ order_id: cOrd, outcome: 'maybe' }), { PAYMENT_MODE: 'test' }, deps); ok(res.status === 400, T('checkout-test: outcome must be paid or failed'));
  res = await payMod.handleCheckoutTest(preq({ order_id: cOrd, outcome: 'paid', amount_fils: 1 }), { PAYMENT_MODE: 'test' }, deps);
  j = await res.json(); o = await one(`select * from public.orders where id = $1`, [cOrd]); ev = await one(`select * from public.events where id = $1`, [EC]);
  ok(res.status === 200 && j.status === 'paid' && o.status === 'paid' && o.amount_fils === 35000 && o.gateway === 'test' && o.gateway_ref === 'test-ref-1' && ev.status === 'active' && ev.invite_limit === 150,
    T('checkout-test: paid → order paid at the server\'s amount (an amount in the request is ignored), event active'));
  res = await payMod.handleCheckout(preq({ order_id: cOrd }), { PAYMENT_MODE: 'test' }, deps); ok(res.status === 409, T('checkout: a paid order → 409 not_pending'));
  res = await payMod.handleCheckoutTest(preq({ order_id: cOrd, outcome: 'failed' }), { PAYMENT_MODE: 'test' }, deps);
  ok(res.status === 409 && (await one(`select status from public.orders where id = $1`, [cOrd])).status === 'paid', T('checkout-test: a paid order can\'t be failed afterwards'));
  const fOrd = (await val(H2, `public.request_change_v2($1,'x',null,null,null,'knet')`, [EC])).order_id;
  res = await payMod.handleCheckoutTest(preq({ order_id: fOrd, outcome: 'failed' }), { PAYMENT_MODE: 'test' }, deps);
  ok(res.status === 200 && (await res.json()).status === 'failed' && (await one(`select status from public.orders where id = $1`, [fOrd])).status === 'failed', T('checkout-test: failed → order failed'));
  res = await payMod.handlePaymentWebhook(new Request('https://x.test/pw', { method: 'POST', body: '{}' }), {}, { log });
  ok(res.status === 501 && (await res.json()).error === 'not_implemented', T('payment-webhook stub: 501 until a gateway is connected'));
  ok(!ilog.some(l => /tok-h2|tok-co|tok-x/.test(l)), T('payment functions never log the login token'));

  // ---------- 16. account deletion for a phone login ----------
  const PD = await mk(null, '96577700001');
  const EPD = await val(PD, `public.create_event_v2('{"title":"Phone only"}'::jsonb)`);
  j = await val(PD, `public.my_account_summary()`);
  ok(j.memberships === 1 && j.events_to_delete.length === 1 && j.events_to_delete[0].id === EPD, T('my_account_summary: a phone login sees the event it would delete'));
  await val(PD, `public.save_profile_v2('P','p@x.test')`);
  j = await svc(`public.delete_account_data($1, '')`, [PD.sub]);
  ok(j.event_ids.length === 1 && j.memberships_removed === 1 && !(await one(`select 1 x from public.events where id = $1`, [EPD])) && !(await one(`select 1 x from public.profiles where user_id = $1`, [PD.sub])),
    T('delete_account_data: a phone login\'s solo events, access and profile are removed'));
};
