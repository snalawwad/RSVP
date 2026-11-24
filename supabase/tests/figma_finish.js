// Checks for supabase/migrations/0010_figma_finish.sql: guest notes, a draft + approval for paid invitation changes,
// notifications on/off, "With …" on hosted events and "From …" / "Reply by" on invites. Throwaway Postgres only.
module.exports = async function figmaFinish({ c, ok, as }) {
  const q = async (sql, p) => (await c.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const T = s => '[0010] ' + s;
  const mk = async (email, phone) => {
    const id = (await one(`insert into auth.users(email) values ($1) returning id`, [email]))?.id;
    return { sub: id, email: email || '', phone: phone || '', role: 'authenticated' };
  };
  const call = (who, sql, p) => as('authenticated', who, sql, p);
  const val = async (who, sql, p) => (await call(who, `select ${sql} j`, p)).rows[0].j;
  const err = pr => pr.then(() => '(no error)', e => e.message);
  const H = await mk('ffhost@test.local'), X = await mk('ffstranger@test.local'), CO = await mk(null, '96555511111');
  const G = await mk(null, '96566611111');
  const A = { sub: (await one(`select gen_random_uuid() id`)).id, email: 'admin@test.local', role: 'authenticated' };
  const anon = sql => as('anon', {}, `select ${sql} j`).then(r => r.rows[0].j);

  // an active event with a co-host, a door person and two guests
  const E = await val(H, `public.create_event_v2($1::jsonb)`, [JSON.stringify({ title: 'Dana & Mohammad engagement', venue: 'Al Hamra Hall', lang: 'en', invite_line: 'The M and S families' })]);
  await q(`update public.events set status = 'active', invite_limit = 50, starts_at = now() + interval '3 days', rsvp_deadline = now() + interval '1 day' where id = $1`, [E]);
  await q(`update public.event_members set name = 'Dana S' where event_id = $1 and role = 'host'`, [E]);
  await val(H, `public.add_member_v2($1, 'Mohammad M', '96555511111', null, 'cohost')`, [E]);
  await val(H, `public.add_member_v2($1, 'Abdullah', null, 'ffdoor@test.local', 'door')`, [E]);

  // ---------- 1. guest notes ----------
  const g1 = (await call(H, `insert into public.guests(event_id, name, phone, seats, side, note) values ($1, 'Fatma', '96566611111', 1, 'Groom''s side', 'Groom''s mum') returning id, note`, [E])).rows[0];
  ok(g1.note === "Groom's mum", T('the host adds a guest with a note'));
  const read = (await call(H, `select note from public.guests where id = $1`, [g1.id])).rows[0];
  ok(read && read.note === "Groom's mum", T('the host reads the note back'));
  ok(/guests_note_len/.test(await err(call(H, `update public.guests set note = repeat('x', 201) where id = $1`, [g1.id]))), T('a note longer than 200 characters is refused'));
  const co = await val(CO, `(select jsonb_agg(to_jsonb(x)) from public.cohost_guests_v2($1) x)`, [E]);
  ok(Array.isArray(co) && co.length === 1 && !('note' in co[0]) && !('phone' in co[0]), T('co-hosts see the guest without the note or the phone'));
  ok((await call(X, `select count(*)::int n from public.guests where event_id = $1`, [E])).rows[0].n === 0, T('a stranger can\'t read guests (or their notes)'));

  // ---------- 2. a draft for a paid change ----------
  const rq = await val(H, `public.request_change_v2($1, '8 PM, bigger names', null, null, '{}', 'knet')`, [E]);
  await as('service_role', {}, `select public._v2_mark_paid($1, 'test', 'r1')`, [rq.order_id]);
  ok((await one(`select status from public.change_requests where id = $1`, [rq.request_id])).status === 'requested', T('a paid change is "requested"'));
  ok(/NO_DRAFT_YET/.test(await err(val(H, `public.approve_change_v2($1)`, [rq.request_id]))), T('approve_change_v2: nothing to approve before the team sends a draft'));
  ok(/BAD_STATUS/.test(await err(val(A, `public.admin_set_request_v2('change', $1, 'nonsense', null)`, [rq.request_id]))), T('admin_set_request_v2: an unknown status is refused'));
  const set = await val(A, `public.admin_set_request_v2('change', $1, 'draft_sent', 'https://example.com/draft.jpg')`, [rq.request_id]);
  ok(set.status === 'draft_sent' && set.draft_url === 'https://example.com/draft.jpg', T('the team sends a draft for a change (status and link)'));
  ok(/Not allowed|not allowed/i.test(await err(val(H, `public.admin_set_request_v2('change', $1, 'done', null)`, [rq.request_id]))), T('a host can\'t set a request\'s status'));
  const mine = await val(H, `public.event_requests_v2($1)`, [E]);
  const ch = mine.find(r => r.id === rq.request_id);
  ok(ch && ch.status === 'draft_sent' && ch.draft_url === 'https://example.com/draft.jpg' && ch.what === '8 PM, bigger names', T('event_requests_v2: the host sees the draft link and what they asked for'));
  const adm = await val(A, `public.admin_requests_v2()`);
  ok(adm.some(r => r.id === rq.request_id && r.draft_url === 'https://example.com/draft.jpg'), T('admin_requests_v2: the team sees the draft link'));
  for (const [n, w] of [['a stranger', X], ['a co-host', CO]]) ok(/Not allowed/.test(await err(val(w, `public.approve_change_v2($1)`, [rq.request_id]))), T(`approve_change_v2: ${n} is refused`));
  ok(/permission denied/.test(await err(anon(`public.approve_change_v2('${rq.request_id}')`))), T('approve_change_v2: logged-out visitors refused'));
  const orders0 = (await one(`select count(*)::int n from public.orders where event_id = $1`, [E])).n;
  const ap = await val(H, `public.approve_change_v2($1)`, [rq.request_id]);
  ok(ap.status === 'approved' && ap.already === false, T('the host approves the draft'));
  ok((await one(`select count(*)::int n from public.orders where event_id = $1`, [E])).n === orders0, T('approving a paid change charges nothing more'));
  const ap2 = await val(H, `public.approve_change_v2($1)`, [rq.request_id]);
  ok(ap2.status === 'approved' && ap2.already === true, T('approving twice is safe'));
  const done = await val(A, `public.admin_set_request_v2('change', $1, 'done', null)`, [rq.request_id]);
  ok(done.status === 'done' && done.done_at && done.draft_url === 'https://example.com/draft.jpg', T('the team marks it done (the draft link stays)'));
  ok((await one(`select count(*)::int n from public.audit_logs where event_id = $1 and action = 'approve_change'`, [E])).n === 1, T('the approval is in the activity log once'));

  // ---------- 3. notifications ----------
  let p = await val(H, `public.my_profile_v2()`);
  ok(p.notify === true, T('notifications are on by default'));
  p = await val(H, `public.set_notify_v2(false)`);
  ok(p.notify === false && (await val(H, `public.my_profile_v2()`)).notify === false, T('set_notify_v2(false) turns them off and it is saved'));
  p = await val(H, `public.set_notify_v2(true)`); ok(p.notify === true, T('and back on'));
  ok(/permission denied/.test(await err(anon(`public.set_notify_v2(false)`))), T('set_notify_v2: logged-out visitors refused'));
  const pX = await val(X, `public.my_profile_v2()`); ok(pX.notify === true, T('another account keeps its own setting'));

  // ---------- 4. "With …" and "From …" ----------
  const evH = (await val(H, `public.my_events_v2()`)).find(e => e.id === E);
  ok(evH && JSON.stringify(evH.with) === JSON.stringify(['Mohammad M']), T('my_events_v2: the host sees "With Mohammad M" (not themselves, not the door)'));
  ok(evH && evH.counts && evH.counts.invited === 1 && 'invite_limit' in evH, T('my_events_v2: the old keys are still there'));
  const evC = (await val(CO, `public.my_events_v2()`)).find(e => e.id === E);
  ok(evC && JSON.stringify(evC.with) === JSON.stringify(['Dana S']), T('my_events_v2: the co-host sees "With Dana S"'));
  ok(!JSON.stringify(evH.with).includes('9655') && !JSON.stringify(evH.with).includes('@'), T('my_events_v2: "with" holds names only'));
  const evD = (await val({ sub: (await one(`insert into auth.users(email) values ('ffdoor@test.local') returning id`)).id, email: 'ffdoor@test.local', role: 'authenticated' }, `public.my_events_v2()`)).find(e => e.id === E);
  ok(evD && evD.role === 'door' && JSON.stringify(evD.with) === '[]', T('my_events_v2: door staff get no names'));
  const inv = (await val(G, `public.my_invites_v2()`));
  ok(inv.length === 1 && inv[0].event.invite_line === 'The M and S families' && inv[0].event.reply_by, T('my_invites_v2: the invite line and reply-by date for "From …" and "Reply by"'));
  ok(!JSON.stringify(inv).includes('Groom'), T('my_invites_v2: the host\'s note never reaches the guest'));
};
