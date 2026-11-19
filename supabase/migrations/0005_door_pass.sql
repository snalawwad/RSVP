-- ======================================================================
-- Sina: door pass (QR) for every guest (additive)
--
-- HOW TO RUN: Supabase → SQL Editor → New query → paste this whole file → Run.
-- Run it only after migrations/002_mvp_core.sql (already on live). Independent of 0003 and 0004.
--
-- WHAT IT ADDS
--  * Every guest (old ones too) gets a door pass made of two parts:
--      pass_key  – secret, unguessable (32 url-safe characters). It is what the
--                  QR code carries: <site>/door.html#p=<pass_key>.
--                  It lives in its own locked table, public.guest_passes
--                  (row security on, no policies, no grants), NOT on guests, so
--                  it never reaches host/admin guest lists, to_jsonb(guest)
--                  results or realtime messages. Only the functions below read it.
--      pass_code – 4 digits, unique within the event, a new guests column,
--                  printed on the pass as "SN-4821" so door staff can type it.
--    Triggers fill both for every new guest. Nobody can change them afterwards
--    (an edit to pass_code is quietly ignored), so a pass that was shown stays valid.
--  * get_invite_v2 / respond_v2 / public_rsvp_v2 return one more key, "pass":
--    {"key": ..., "code": ...} only while the guest's reply is "yes", otherwise null.
--    Every key they returned before is unchanged.
--  * door_list_v2 rows get one more column, pass_code (never pass_key).
--    (Postgres can't add a column to a function's result in place, so the
--    function is dropped and created again inside this one transaction, with the
--    same rules and the same permissions. The door page keeps working.)
--  * One new function, door_pass_lookup_v2(event, key): door/host/admin of that
--    event scan a pass and get the same row door_list_v2 gives for that guest,
--    or null. Every scan is written to the activity log as 'pass_scan'
--    (guest id and whether it matched, never the key).
--
-- WHAT IT DOES NOT DO
--  * No table, column, row or function the live pages use is removed or renamed.
--  * The pages work without this file: no "pass" → the invite shows no pass;
--    no door_pass_lookup_v2 → the door hides its Scan button.
--
-- TO REMOVE IT AGAIN (in this order):
--   drop function if exists public.door_pass_lookup_v2(uuid, text);
--   drop function if exists public.door_list_v2(uuid);
--   -- then run migrations/002_mvp_core.sql again (it puts back the original
--   -- door_list_v2 and _v2_guest_json and changes nothing else), then:
--   drop trigger if exists guests_v2_pass on public.guests;
--   drop trigger if exists guests_v2_pass_key on public.guests;
--   drop function if exists public._v2_pass_fill(), public._v2_pass_key_add(), public._v2_pass_code(uuid, uuid), public._v2_pass_key();
--   drop table if exists public.guest_passes;
--   alter table public.guests drop column if exists pass_code;
--   NOTE: 002 can't be run again while this file's door_list_v2 is in place.
-- ======================================================================
begin;

-- ---------- 0. Check the database looks the way this file expects ----------
do $$
begin
  if to_regclass('public.audit_logs') is null
     or to_regprocedure('public._v2_role(uuid)') is null
     or to_regprocedure('public._v2_host_side(uuid)') is null
     or to_regprocedure('public._v2_log(uuid, text, jsonb)') is null
     or to_regprocedure('public._v2_guest_json(public.guests, public.events)') is null
     or to_regprocedure('public.door_list_v2(uuid)') is null then
    raise exception 'Stopped, nothing changed. Run 002_mvp_core.sql first.';
  end if;
end $$;

-- ---------- 1. New column and the locked key table ----------
alter table public.guests add column if not exists pass_code text;

create table if not exists public.guest_passes (
  guest_id uuid primary key references public.guests(id) on delete cascade,
  pass_key text not null unique,
  created_at timestamptz not null default now()
);
comment on table public.guest_passes is 'Secret door-pass keys (what the QR carries). Read only by security-definer functions; no client access.';
-- Locked: row security on with no policies, and no table rights for the app's roles.
alter table public.guest_passes enable row level security;
revoke all on public.guest_passes from public, anon, authenticated;

-- ---------- 2. Making keys and codes ----------
-- 24 random bytes as url-safe base64 (32 characters, about 192 bits).
-- pgcrypto's gen_random_bytes lives in "extensions" on Supabase and in "public"
-- on a plain Postgres; both are on the search path. If it is missing anywhere,
-- two random UUIDs (same random source in Postgres 13+) are used instead.
create or replace function public._v2_pass_key() returns text
language plpgsql volatile set search_path = public, extensions as $$
declare b bytea;
begin
  begin
    b := gen_random_bytes(24);
  exception when undefined_function then
    b := substring(decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex') from 1 for 24);
  end;
  return translate(encode(b, 'base64'), E'+/=\n', '-_');
end $$;

-- A 4-digit code (1000–9999) no other guest of this event has.
-- One writer per event at a time (advisory lock until the transaction ends),
-- so two imports at once can't hand out the same code.
create or replace function public._v2_pass_code(p_event uuid, p_guest uuid) returns text
language plpgsql volatile security definer set search_path = public as $$
declare c text; i int;
begin
  perform pg_advisory_xact_lock(hashtext('sina-pass-' || p_event::text));
  for i in 1 .. 40 loop
    c := (1000 + floor(random() * 9000))::int::text;
    if not exists (select 1 from public.guests where event_id = p_event and pass_code = c and id is distinct from p_guest) then
      return c;
    end if;
  end loop;
  -- the event is nearly full of codes: take the first free one
  select s::text into c from generate_series(1000, 9999) s
   where not exists (select 1 from public.guests where event_id = p_event and pass_code = s::text and id is distinct from p_guest)
   order by s limit 1;
  if c is null then raise exception 'No door pass codes left for this event' using errcode = '23514'; end if;
  return c;
end $$;

-- New guest: always gets a fresh code (whatever the insert said).
-- Existing guest: the code can't be changed; a missing one is filled;
-- a guest moved to another event gets a code for that event.
create or replace function public._v2_pass_fill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.pass_code := public._v2_pass_code(new.event_id, new.id);
    return new;
  end if;
  if old.pass_code is null or new.event_id is distinct from old.event_id then
    new.pass_code := public._v2_pass_code(new.event_id, new.id);
  else
    new.pass_code := old.pass_code;
  end if;
  return new;
end $$;

drop trigger if exists guests_v2_pass on public.guests;
create trigger guests_v2_pass before insert or update of pass_code, event_id on public.guests
  for each row execute function public._v2_pass_fill();

-- New guest: its secret key goes into guest_passes (after the insert, so the row exists).
create or replace function public._v2_pass_key_add() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.guest_passes(guest_id, pass_key) values (new.id, public._v2_pass_key())
    on conflict (guest_id) do nothing;
  return null;
end $$;

drop trigger if exists guests_v2_pass_key on public.guests;
create trigger guests_v2_pass_key after insert on public.guests
  for each row execute function public._v2_pass_key_add();

-- ---------- 3. Give every existing guest a pass ----------
-- (the trigger fills the code; only pass_code is touched, so no other trigger runs)
update public.guests set pass_code = pass_code where pass_code is null;
insert into public.guest_passes(guest_id, pass_key)
  select g.id, public._v2_pass_key() from public.guests g
   where not exists (select 1 from public.guest_passes p where p.guest_id = g.id);

alter table public.guests alter column pass_code set not null;
create unique index if not exists guests_event_pass_code_key on public.guests (event_id, pass_code);

-- ---------- 4. Guest JSON: + "pass" while the reply is yes ----------
-- Only get_invite_v2 / respond_v2 / public_rsvp_v2 (security definer) call this;
-- the app's roles can't call it, and couldn't read guest_passes if they did.
create or replace function public._v2_guest_json(g public.guests, e public.events) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('name', g.name, 'seats', g.seats, 'status', g.status, 'token', g.token, 'decline_reason', g.decline_reason,
    'confirmed_count', g.confirmed_count, 'event', public._v2_event_json(e),
    'pass', (select jsonb_build_object('key', p.pass_key, 'code', g.pass_code)
               from public.guest_passes p where p.guest_id = g.id and g.status = 'yes' and g.pass_code is not null))
$$;

-- ---------- 5. Door list: + pass_code ----------
drop function if exists public.door_list_v2(uuid);
create function public.door_list_v2(p_event uuid)
returns table(id uuid, name text, phone text, seats int, status text, confirmed_count int, checked_in_count int,
              decline_reason text, side text, checked_in_at timestamptz, pass_code text)
language plpgsql stable security definer set search_path = public as $$
declare s text := public._v2_host_side(p_event);
begin
  if public._v2_role(p_event) is null then raise exception 'Not allowed'; end if;
  return query select g.id, g.name::text, g.phone::text, g.seats, g.status::text, g.confirmed_count, g.checked_in_count,
                      g.decline_reason::text, g.side::text, g.checked_in_at, g.pass_code::text
    from public.guests g where g.event_id = p_event and (s is null or g.side = s) order by g.name;
end $$;

-- ---------- 6. Scan a pass at the door ----------
-- p_key: the pass key, or the whole QR link (…/door.html#p=<key>).
-- Returns the guest's door_list_v2 row as JSON, or null when no guest of this
-- event (on this host's list) has that key.
create or replace function public.door_pass_lookup_v2(p_event uuid, p_key text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare k text := trim(coalesce(p_key, '')); gid uuid; row_ jsonb;
begin
  if public._v2_role(p_event) is null then raise exception 'Not allowed'; end if;
  k := coalesce(substring(k from '[#?&]p=([A-Za-z0-9_-]+)'), k);
  if k ~ '^[A-Za-z0-9_-]{22,64}$' then
    select g.id into gid from public.guest_passes p join public.guests g on g.id = p.guest_id
     where p.pass_key = k and g.event_id = p_event;
  end if;
  if gid is not null then
    select to_jsonb(d) into row_ from public.door_list_v2(p_event) d where d.id = gid;   -- same row, same list limits
  end if;
  perform public._v2_log(p_event, 'pass_scan', jsonb_build_object('guest', row_ ->> 'id', 'found', row_ is not null));
  return row_;
end $$;

-- ---------- 7. Who can call what ----------
revoke all on function public._v2_pass_key(), public._v2_pass_code(uuid, uuid), public._v2_pass_fill(), public._v2_pass_key_add() from public, anon, authenticated;
revoke all on public.guest_passes from public, anon, authenticated;
revoke all on function public.door_list_v2(uuid), public.door_pass_lookup_v2(uuid, text) from public, anon;
grant execute on function public.door_list_v2(uuid), public.door_pass_lookup_v2(uuid, text) to authenticated;

commit;
select 'Door pass added' as result;
