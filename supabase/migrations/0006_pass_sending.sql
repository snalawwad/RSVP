-- ======================================================================
-- Sina: door passes go out on WhatsApp the day before (additive)
--
-- HOW TO RUN: Supabase → SQL Editor → New query → paste this whole file → Run.
-- Run it only after 0005_door_pass.sql. Safe to run again.
--
-- WHAT IT ADDS
--  * events.pass_release_at (timestamptz, empty by default): when confirmed
--    guests get their door pass. Empty = the day before the event at 16:00
--    Kuwait time. An event with no date gets no pass until a date (or a
--    release time) is set. Admin "release now" = set it to now().
--  * events.pass_auto_send (true/false, false by default): send each confirmed
--    guest's pass on WhatsApp automatically once it is released.
--  * The invite (get_invite_v2 / respond_v2 / public_rsvp_v2) now gives
--    "pass" only once it is released, and one new key "pass_at" (the release
--    time, or null when the event has no date yet) while the reply is yes.
--    Every other key is unchanged.
--  * One table, public.pass_sends: one row per guest whose pass was sent
--    (by WhatsApp or by hand), with its delivery state. No phone numbers,
--    links, pass keys or message text are kept in it. Hosts/admins of the
--    event can read their rows; nobody can write to it except the functions below.
--  * Server-only functions (only the send-door-passes / whatsapp-webhook
--    server functions can call them, with the service key):
--      pass_send_claim(limit), pass_send_result(guest, ok, msg_id, error),
--      pass_send_status_update(msg_id, status, error, guest).
--  * Host/admin functions: pass_send_status_v2(event), pass_mark_manual_v2(guest).
--  * Changes to the two new event settings are written to the activity log.
--
-- WHAT IT DOES NOT DO
--  * Nothing is sent by this file. Sending needs the server function, the
--    WhatsApp setup and the schedule in supabase/cron/pass_sender.sql
--    (see supabase/WHATSAPP_SETUP.md). pass_auto_send is off for every event.
--  * No table, column, row or function the live pages use is removed or renamed.
--
-- TO REMOVE IT AGAIN (in this order):
--   drop function if exists public.pass_mark_manual_v2(uuid), public.pass_send_status_v2(uuid),
--     public.pass_send_status_update(text, text, text, uuid), public.pass_send_result(uuid, boolean, text, text),
--     public.pass_send_claim(int);
--   drop trigger if exists events_v2_pass_settings on public.events;
--   drop function if exists public._v2_pass_settings_log();
--   drop table if exists public.pass_sends;
--   drop function if exists public._v2_pass_reader(uuid, uuid);
--   -- then run 0005_door_pass.sql's section 4 again (puts back _v2_guest_json
--   -- without the release gate), then:
--   drop function if exists public._v2_pass_release(public.events);
--   alter table public.events drop column if exists pass_auto_send, drop column if exists pass_release_at;
-- ======================================================================
begin;

-- ---------- 0. Check the database looks the way this file expects ----------
do $$
begin
  if to_regclass('public.guest_passes') is null
     or to_regprocedure('public._v2_role(uuid)') is null
     or to_regprocedure('public._v2_host_side(uuid)') is null
     or to_regprocedure('public._v2_log(uuid, text, jsonb)') is null
     or to_regprocedure('public._v2_event_json(public.events)') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'guests' and column_name = 'pass_code') then
    raise exception 'Stopped, nothing changed. Run 0005_door_pass.sql first.';
  end if;
end $$;

-- ---------- 1. Event settings ----------
alter table public.events add column if not exists pass_release_at timestamptz;
alter table public.events add column if not exists pass_auto_send boolean not null default false;
comment on column public.events.pass_release_at is 'When confirmed guests get their door pass. Null = the day before starts_at at 16:00 Asia/Kuwait.';
comment on column public.events.pass_auto_send is 'Send each confirmed guest''s door pass on WhatsApp automatically once released.';

-- When the pass is released: the set time, or the day before the event at
-- 16:00 Kuwait time, or null (no date yet = not released).
create or replace function public._v2_pass_release(e public.events) returns timestamptz
language sql stable set search_path = public as $$
  select coalesce(e.pass_release_at,
    case when e.starts_at is not null then
      ((((e.starts_at at time zone 'Asia/Kuwait')::date - 1) + time '16:00') at time zone 'Asia/Kuwait') end)
$$;

-- ---------- 2. Guest JSON: "pass" only once released, + "pass_at" ----------
create or replace function public._v2_guest_json(g public.guests, e public.events) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('name', g.name, 'seats', g.seats, 'status', g.status, 'token', g.token, 'decline_reason', g.decline_reason,
    'confirmed_count', g.confirmed_count, 'event', public._v2_event_json(e),
    'pass', (select jsonb_build_object('key', p.pass_key, 'code', g.pass_code)
               from public.guest_passes p
              where p.guest_id = g.id and g.status = 'yes' and g.pass_code is not null
                and public._v2_pass_release(e) <= now()),
    'pass_at', case when g.status = 'yes' then public._v2_pass_release(e) end)
$$;

-- ---------- 3. What was sent ----------
create table if not exists public.pass_sends (
  guest_id uuid primary key references public.guests(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'manual')),
  status text not null check (status in ('sending', 'sent', 'delivered', 'read', 'failed', 'manual')),
  attempts int not null default 0 check (attempts >= 0),
  last_error text check (last_error is null or length(last_error) <= 300),
  provider_msg_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.pass_sends is 'Door pass sending state per guest. No phones, links, keys or message text.';
create index if not exists pass_sends_event_idx on public.pass_sends(event_id, status);

-- Read access: host/admin of the event, and a host limited to one list only sees that list.
create or replace function public._v2_pass_reader(p_event uuid, p_guest uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare s text;
begin
  if coalesce(public._v2_role(p_event), '') not in ('admin', 'host') then return false; end if;
  s := public._v2_host_side(p_event);
  return s is null or exists (select 1 from public.guests g where g.id = p_guest and g.side = s);
end $$;

alter table public.pass_sends enable row level security;
revoke all on public.pass_sends from public, anon, authenticated;
grant select on public.pass_sends to authenticated;
drop policy if exists pass_sends_read on public.pass_sends;
create policy pass_sends_read on public.pass_sends for select to authenticated
  using (public._v2_pass_reader(event_id, guest_id));

-- ---------- 4. Server-only: the sender and the WhatsApp webhook ----------
-- Claim up to p_limit guests whose pass is due and mark them 'sending'.
-- Due = event sends automatically, pass released, event not over (starts_at + 1 day),
-- reply yes, has a phone, and not sent yet (or failed fewer than 3 times and
-- waited 10 min × attempts). A 'sending' row older than 15 minutes (the sender
-- stopped half way) counts as failed and is NOT tried again: WhatsApp may already
-- have sent it, so it goes to the hosts' "send by hand" list instead of a second
-- message (the webhook still marks it sent if WhatsApp did send it). Safe with
-- several senders at once.
create or replace function public.pass_send_claim(p_limit int default 25)
returns table(guest_id uuid, event_id uuid, phone text, name text, people int, token text, lang text,
              event_title text, starts_at timestamptz, venue text)
language plpgsql volatile security definer set search_path = public as $$
declare lim int := least(greatest(coalesce(p_limit, 25), 1), 200);
begin
  -- crash recovery: a send that never reported back counts as failed, with no automatic retry
  -- (it may have gone out; a blind retry could send the guest a second message)
  update public.pass_sends s set status = 'failed', last_error = 'unclear:no_result', attempts = greatest(s.attempts, 3)
   where s.status = 'sending' and s.updated_at < now() - interval '15 minutes';

  return query
  with cand as (
    select g.id as gid, g.event_id as eid
      from public.guests g
      join public.events e on e.id = g.event_id
      left join public.pass_sends s on s.guest_id = g.id
     where e.pass_auto_send
       and public._v2_pass_release(e) <= now()
       and e.starts_at is not null and e.starts_at + interval '1 day' > now()
       and g.status = 'yes'
       and nullif(trim(coalesce(g.phone, '')), '') is not null
       and (s.guest_id is null
            or (s.status = 'failed' and s.attempts < 3 and s.updated_at <= now() - make_interval(mins => 10 * s.attempts)))
     order by e.starts_at, g.id
     limit lim
     for update of g skip locked
  ), got as (
    -- the upsert re-checks the latest row, so two senders never claim the same guest
    insert into public.pass_sends as s (guest_id, event_id, channel, status, attempts, created_at, updated_at)
    select cand.gid, cand.eid, 'whatsapp', 'sending', 1, now(), now() from cand
    on conflict on constraint pass_sends_pkey do update
       set status = 'sending', channel = 'whatsapp', attempts = s.attempts + 1, provider_msg_id = null, updated_at = now()
     where s.status = 'failed' and s.attempts < 3 and s.updated_at <= now() - make_interval(mins => 10 * s.attempts)
    returning s.guest_id as gid
  )
  select g.id, g.event_id, g.phone::text, g.name::text,
         coalesce(g.confirmed_count, g.seats)::int, g.token::text, e.lang::text,
         coalesce(nullif(trim(e.headline), ''), e.title)::text, e.starts_at, e.venue::text
    from got join public.guests g on g.id = got.gid join public.events e on e.id = g.event_id
   order by e.starts_at, g.id;
end $$;

-- The sender reports one guest: p_ok true = WhatsApp accepted it (p_msg_id = its id),
-- false = failed (p_error, short), null = not tried after all (the claim is given back).
-- The start of p_error decides what happens next:
--   'final:'   this guest can't get it (not on WhatsApp, bad number): no more tries
--   'unclear:' no clear answer (timeout, WhatsApp server error): it may have gone out,
--              so no automatic retry; the hosts' list shows it (the webhook can still mark it sent)
--   'config:'  our setup is wrong (token, template, account): not this guest's fault, so the
--              try doesn't count; the guest is due again on the next run
--   anything else: tried again later (10 min × attempts, 3 tries in all)
-- Only a guest that is 'sending' changes. Returns the new status, or null if nothing changed.
create or replace function public.pass_send_result(p_guest uuid, p_ok boolean, p_msg_id text, p_error text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare s public.pass_sends; err text := left(regexp_replace(coalesce(p_error, ''), '[+]?[0-9][0-9 -]{5,}[0-9]', '…', 'g'), 300);
begin
  select * into s from public.pass_sends where guest_id = p_guest for update;
  if not found or s.status <> 'sending' then return null; end if;
  if p_ok is null then
    if s.attempts <= 1 and s.last_error is null then
      delete from public.pass_sends where guest_id = p_guest;
      return 'released';
    end if;
    update public.pass_sends set status = 'failed', attempts = greatest(0, s.attempts - 1) where guest_id = p_guest;
    return 'released';
  end if;
  if p_ok then
    update public.pass_sends set status = 'sent', provider_msg_id = nullif(left(trim(coalesce(p_msg_id, '')), 200), ''),
      last_error = null, updated_at = now() where guest_id = p_guest;
    perform public._v2_log(s.event_id, 'pass_sent', jsonb_build_object('guest', p_guest, 'channel', 'whatsapp', 'attempt', s.attempts));
    return 'sent';
  end if;
  if err like 'config:%' then
    -- not logged per guest: the same setup problem would fill the activity log every 10 minutes
    update public.pass_sends set status = 'failed', last_error = err, attempts = greatest(0, s.attempts - 1), updated_at = now()
     where guest_id = p_guest;
    return 'failed';
  end if;
  update public.pass_sends set status = 'failed', last_error = coalesce(nullif(err, ''), 'error'),
    attempts = case when err like 'final:%' or err like 'unclear:%' then greatest(s.attempts, 3) else s.attempts end, updated_at = now()
   where guest_id = p_guest;
  perform public._v2_log(s.event_id, 'pass_send_failed', jsonb_build_object('guest', p_guest, 'attempt', s.attempts, 'error', left(coalesce(nullif(err, ''), 'error'), 80)));
  return 'failed';
end $$;

-- WhatsApp delivery news (from the webhook). Only moves forward:
-- sent → delivered → read; 'failed' only before it was delivered.
-- p_guest is the guest id the sender put in the message (biz_opaque_callback_data; WhatsApp
-- sends it back). It finds a message whose id was never saved: the sender stopped or the
-- database didn't answer after WhatsApp accepted it, or the send timed out although it went.
-- Such a guest (still 'sending', or failed with an 'unclear:' error) is marked as sent
-- instead of being sent again by hand.
-- Returns the new status, or null if nothing changed.
-- (an earlier draft of this file had no p_guest; drop that one so only one version exists)
drop function if exists public.pass_send_status_update(text, text, text);
create or replace function public.pass_send_status_update(p_msg_id text, p_status text, p_error text default null, p_guest uuid default null)
returns text language plpgsql volatile security definer set search_path = public as $$
declare s public.pass_sends; rk_old int; rk_new int; err text := left(regexp_replace(coalesce(p_error, ''), '[+]?[0-9][0-9 -]{5,}[0-9]', '…', 'g'), 300);
begin
  if coalesce(trim(p_msg_id), '') = '' or p_status not in ('sent', 'delivered', 'read', 'failed') then return null; end if;
  select * into s from public.pass_sends where provider_msg_id = trim(p_msg_id) for update;
  if not found and p_guest is not null then
    select * into s from public.pass_sends ps
     where ps.guest_id = p_guest and ps.channel = 'whatsapp'
       and (ps.status = 'sending' or (ps.status = 'failed' and ps.last_error like 'unclear:%'))
     for update;
    if not found then return null; end if;
    if p_status = 'failed' then
      if s.status <> 'sending' then return null; end if;
      update public.pass_sends set status = 'failed', provider_msg_id = left(trim(p_msg_id), 200), last_error = coalesce(nullif(err, ''), 'failed'),
        attempts = case when err like 'final:%' then greatest(s.attempts, 3) else s.attempts end, updated_at = now()
       where guest_id = s.guest_id;
      perform public._v2_log(s.event_id, 'pass_send_failed', jsonb_build_object('guest', s.guest_id, 'attempt', s.attempts, 'error', left(coalesce(nullif(err, ''), 'failed'), 80)));
      return 'failed';
    end if;
    update public.pass_sends set status = p_status, provider_msg_id = left(trim(p_msg_id), 200), last_error = null, updated_at = now()
     where guest_id = s.guest_id;
    perform public._v2_log(s.event_id, 'pass_sent', jsonb_build_object('guest', s.guest_id, 'channel', 'whatsapp', 'attempt', s.attempts, 'late', true));
    return p_status;
  end if;
  if not found or s.channel <> 'whatsapp' then return null; end if;
  rk_old := case s.status when 'sending' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 9 end;
  if p_status = 'failed' then
    if rk_old > 1 then return null; end if;
    update public.pass_sends set status = 'failed', last_error = coalesce(nullif(err, ''), 'failed'),
      attempts = case when err like 'final:%' then greatest(s.attempts, 3) else s.attempts end, updated_at = now()
     where guest_id = s.guest_id;
    perform public._v2_log(s.event_id, 'pass_send_failed', jsonb_build_object('guest', s.guest_id, 'attempt', s.attempts, 'error', left(coalesce(nullif(err, ''), 'failed'), 80)));
    return 'failed';
  end if;
  rk_new := case p_status when 'sent' then 1 when 'delivered' then 2 else 3 end;
  if rk_new <= rk_old or rk_old = 9 then return null; end if;
  update public.pass_sends set status = p_status, updated_at = now() where guest_id = s.guest_id;
  return p_status;
end $$;

-- ---------- 5. Host / admin ----------
-- Sending overview for one event (a host limited to one list sees that list).
-- counts: due (waiting to be sent: not sent yet, or failed and will be retried), sent, delivered, read,
--         failed (no more tries: send by hand), manual (host sent it themselves), no_phone (can't be sent).
-- todo: confirmed guests the host should send by hand, once the pass is released and the event isn't over:
--   'failed'       – WhatsApp gave up on them
--   'no_auto'      – this event doesn't send automatically
--   'not_sent_yet' – sends automatically, but still not sent 30 minutes after release (sender not
--                    running, or held up by a setup problem such as an expired token)
-- last_error: the latest failure (a setup problem shows here too, starting 'config:').
create or replace function public.pass_send_status_v2(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e public.events; s text; rel timestamptz; open_ boolean; res jsonb;
begin
  if coalesce(public._v2_role(p_event), '') not in ('admin', 'host') then raise exception 'Not allowed'; end if;
  select * into e from public.events where id = p_event;
  if not found then raise exception 'Not allowed'; end if;
  s := public._v2_host_side(p_event);
  rel := public._v2_pass_release(e);
  open_ := rel is not null and rel <= now() and (e.starts_at is null or e.starts_at + interval '1 day' > now());
  with x as (
    select g.id, g.name, coalesce(g.confirmed_count, g.seats) as people, g.phone,
           nullif(trim(coalesce(g.phone, '')), '') is not null as has_phone,
           ps.guest_id is not null as has_row, ps.updated_at,
           -- a send stuck for 15 minutes counts as failed with no retry (as pass_send_claim treats it)
           case when ps.status = 'sending' and ps.updated_at < now() - interval '15 minutes' then greatest(ps.attempts, 3) else ps.attempts end as attempts,
           case when ps.status = 'sending' and ps.updated_at < now() - interval '15 minutes' then 'unclear:no_result' else ps.last_error end as last_error,
           case when ps.status = 'sending' and ps.updated_at < now() - interval '15 minutes' then 'failed' else ps.status end as st
      from public.guests g left join public.pass_sends ps on ps.guest_id = g.id
     where g.event_id = p_event and g.status = 'yes' and (s is null or g.side = s)
  ), y as (
    select x.*,
      case
        when st in ('sent', 'delivered', 'read', 'manual') then st
        when st = 'failed' and (not e.pass_auto_send or attempts >= 3 or not has_phone) then 'failed'
        when not has_phone and not has_row then 'no_phone'
        else 'due' end as bucket
      from x
  )
  select jsonb_build_object(
    'auto', e.pass_auto_send,
    'release_at', rel,
    'last_error', (select y.last_error from y where (y.bucket = 'failed' or y.last_error like 'config:%') and y.last_error is not null order by y.updated_at desc limit 1),
    'counts', jsonb_build_object(
      'due', count(*) filter (where bucket = 'due'), 'sent', count(*) filter (where bucket = 'sent'),
      'delivered', count(*) filter (where bucket = 'delivered'), 'read', count(*) filter (where bucket = 'read'),
      'failed', count(*) filter (where bucket = 'failed'), 'manual', count(*) filter (where bucket = 'manual'),
      'no_phone', count(*) filter (where bucket = 'no_phone')),
    'todo', coalesce((
      select jsonb_agg(jsonb_build_object('guest_id', t.id, 'name', t.name, 'people', t.people, 'phone', t.phone, 'reason', t.reason)
                       order by t.reason, t.name)
        from (select y.*, case
                when y.bucket = 'failed' then 'failed'
                when y.bucket = 'due' and y.has_phone and not y.has_row and not e.pass_auto_send then 'no_auto'
                when y.bucket = 'due' and y.has_phone and (not y.has_row or y.last_error like 'config:%') and e.pass_auto_send
                     and rel <= now() - interval '30 minutes' then 'not_sent_yet'
              end as reason from y) t
       where open_ and t.reason is not null), '[]'::jsonb))
    into res from y;
  return res;
end $$;

-- The host sent this guest's pass by hand (from their own WhatsApp).
-- Changes nothing if WhatsApp already sent it. Returns {guest_id, status}.
create or replace function public.pass_mark_manual_v2(p_guest uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g public.guests; r text; sd text; st text;
begin
  select * into g from public.guests where id = p_guest;
  if not found then raise exception 'Guest not found'; end if;
  r := public._v2_role(g.event_id); sd := public._v2_host_side(g.event_id);
  if coalesce(r, '') not in ('admin', 'host') or (sd is not null and g.side is distinct from sd) then raise exception 'Not allowed'; end if;
  if g.status is distinct from 'yes' then raise exception 'NOT_CONFIRMED'; end if;
  insert into public.pass_sends as s (guest_id, event_id, channel, status, attempts)
  values (g.id, g.event_id, 'manual', 'manual', 0)
  on conflict on constraint pass_sends_pkey do update
     set channel = 'manual', status = 'manual', provider_msg_id = null, updated_at = now()
   where s.status in ('failed', 'sending')
  returning s.status into st;
  if st is null then
    select ps.status into st from public.pass_sends ps where ps.guest_id = g.id;
  else
    perform public._v2_log(g.event_id, 'pass_manual', jsonb_build_object('guest', g.id));
  end if;
  return jsonb_build_object('guest_id', g.id, 'status', st);
end $$;

-- ---------- 6. Activity log for the two event settings ----------
create or replace function public._v2_pass_settings_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pass_auto_send is distinct from old.pass_auto_send or new.pass_release_at is distinct from old.pass_release_at then
    perform public._v2_log(new.id, 'pass_settings', jsonb_build_object('auto', new.pass_auto_send, 'release_at', new.pass_release_at));
  end if;
  return null;
end $$;
drop trigger if exists events_v2_pass_settings on public.events;
create trigger events_v2_pass_settings after update of pass_auto_send, pass_release_at on public.events
  for each row execute function public._v2_pass_settings_log();

-- ---------- 7. Who can call what ----------
revoke all on function public._v2_pass_release(public.events), public._v2_pass_settings_log(),
  public.pass_send_claim(int), public.pass_send_result(uuid, boolean, text, text),
  public.pass_send_status_update(text, text, text, uuid) from public, anon, authenticated;
-- the read-access check runs inside the table's row rule, as the logged-in user
revoke all on function public._v2_pass_reader(uuid, uuid) from public, anon;
grant execute on function public._v2_pass_reader(uuid, uuid) to authenticated;
revoke all on function public.pass_send_status_v2(uuid), public.pass_mark_manual_v2(uuid) from public, anon;
grant execute on function public.pass_send_status_v2(uuid), public.pass_mark_manual_v2(uuid) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.pass_send_claim(int), public.pass_send_result(uuid, boolean, text, text),
      public.pass_send_status_update(text, text, text, uuid) to service_role;
    grant select on public.pass_sends to service_role;
  end if;
end $$;

commit;
select 'Door pass sending added' as result;
