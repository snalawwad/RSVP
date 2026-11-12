-- ======================================================================
-- RSVP: MVP core upgrade (plus-ones, partial arrivals, door exceptions,
-- RSVP rules, audit log, server-side limits)
--
-- HOW TO RUN: Supabase → SQL Editor → New query → paste this whole file → Run.
--
-- SAFE BY DESIGN
--  * Only ADDS things: new columns, new tables, new functions ending in _v2.
--  * Does NOT change or remove any existing function, so live invites keep
--    working exactly as before while the new pages switch over.
--  * Runs as one transaction. If anything doesn't match, it stops with a
--    clear message and NOTHING is changed.
--  * Safe to run again: every step checks whether it already exists.
-- ======================================================================
begin;

-- ---------- 0. Check the database looks the way this file expects ----------
do $$
declare missing text := '';
  need text[][] := array[
    ['events','id'],['events','public_code'],['events','invite_limit'],['events','lang'],['events','title'],
    ['events','event_type'],['events','invite_line'],['events','headline'],['events','note'],['events','starts_at'],
    ['events','ends_at'],['events','venue'],['events','map_url'],['events','map_spot'],['events','theme_accent'],
    ['events','theme_paper'],['events','card_image_url'],
    ['guests','id'],['guests','event_id'],['guests','name'],['guests','phone'],['guests','seats'],
    ['guests','status'],['guests','token'],['guests','decline_reason'],['guests','checked_in_at'],['guests','side'],
    ['event_members','event_id'],['event_members','email'],['event_members','role']];
  i int;
begin
  for i in 1 .. array_length(need, 1) loop
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = need[i][1] and column_name = need[i][2]) then
      missing := missing || ' ' || need[i][1] || '.' || need[i][2];
    end if;
  end loop;
  if missing <> '' then raise exception 'Stopped, nothing changed. Missing columns:%', missing; end if;
  if (select data_type from information_schema.columns where table_schema='public' and table_name='guests' and column_name='id') <> 'uuid'
     or (select data_type from information_schema.columns where table_schema='public' and table_name='events' and column_name='id') <> 'uuid' then
    raise exception 'Stopped, nothing changed. Expected events.id and guests.id to be uuid.';
  end if;
  if (select data_type from information_schema.columns where table_schema='public' and table_name='guests' and column_name='status') not in ('text','character varying') then
    raise exception 'Stopped, nothing changed. Expected guests.status to be text.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'is_admin' and p.pronargs = 0) then
    raise exception 'Stopped, nothing changed. Function public.is_admin() not found.';
  end if;
end $$;

-- ---------- 1. New columns ----------
alter table public.guests add column if not exists confirmed_count int;
alter table public.guests add column if not exists checked_in_count int not null default 0;
alter table public.guests add column if not exists replied_at timestamptz;

alter table public.events add column if not exists rsvp_deadline timestamptz;
alter table public.events add column if not exists allow_changes boolean not null default true;
alter table public.events add column if not exists public_link_enabled boolean not null default true;

alter table public.event_members add column if not exists expires_at timestamptz;

-- The arrival count may already exist without a starting value: give it 0.
-- Guests who were checked in before this upgrade count as fully arrived.
update public.guests set checked_in_count = case when checked_in_at is not null then seats else 0 end
 where checked_in_count is null or (checked_in_at is not null and checked_in_count = 0);
alter table public.guests alter column checked_in_count set default 0;
alter table public.guests alter column checked_in_count set not null;

-- Count rules. (The 1–6 seat rule lives in the trigger below, so it only applies
-- when seats are set or changed and never blocks older guests from replying.)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'guests_confirmed_in_range') then
    alter table public.guests add constraint guests_confirmed_in_range
      check (confirmed_count is null or (confirmed_count between 0 and seats)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'guests_checked_in_nonneg') then
    alter table public.guests add constraint guests_checked_in_nonneg check (checked_in_count >= 0) not valid;
  end if;
end $$;

-- ---------- 2. New tables ----------
create table if not exists public.checkin_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete set null,
  people int not null check (people > 0),
  by_email text,
  created_at timestamptz not null default now()
);
create index if not exists checkin_events_event_idx on public.checkin_events(event_id);

create table if not exists public.attendance_exceptions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  people int not null check (people between 1 and 20),
  note text check (note is null or length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by text,
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists attendance_exceptions_event_idx on public.attendance_exceptions(event_id, status);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  event_id uuid references public.events(id) on delete cascade,
  actor text,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_event_idx on public.audit_logs(event_id, created_at desc);

-- New tables are reached only through the functions below.
alter table public.checkin_events enable row level security;
alter table public.attendance_exceptions enable row level security;
alter table public.audit_logs enable row level security;
revoke all on public.checkin_events, public.attendance_exceptions, public.audit_logs from anon, authenticated;

-- ---------- 3. Helpers ----------
create or replace function public._v2_email() returns text
language sql stable set search_path = public as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- 'admin', 'host', 'door' or null. Door access ends at expires_at.
create or replace function public._v2_role(p_event uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare r text;
begin
  if public.is_admin() then return 'admin'; end if;
  select case when bool_or(m.role = 'host') then 'host'
              when bool_or(m.role = 'door' and (m.expires_at is null or m.expires_at > now())) then 'door' end
    into r
    from public.event_members m
   where m.event_id = p_event and lower(m.email) = public._v2_email() and public._v2_email() <> '';
  return r;
end $$;

-- The list a host is limited to (null = every list).
create or replace function public._v2_host_side(p_event uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then null else
    (select m.side from public.event_members m
      where m.event_id = p_event and lower(m.email) = public._v2_email() and m.role = 'host' limit 1) end
$$;

create or replace function public._v2_log(p_event uuid, p_action text, p_details jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.audit_logs(event_id, actor, action, details)
  values (p_event, nullif(public._v2_email(), ''), p_action, p_details)
$$;

-- Public event fields only. Never phone numbers or message templates.
create or replace function public._v2_event_json(e public.events) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'title', e.title, 'event_type', e.event_type, 'lang', e.lang, 'invite_line', e.invite_line,
    'headline', e.headline, 'note', e.note, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'venue', e.venue, 'map_url', e.map_url, 'map_spot', e.map_spot,
    'theme_accent', e.theme_accent, 'theme_paper', e.theme_paper, 'card_image_url', e.card_image_url,
    'rsvp_deadline', e.rsvp_deadline, 'allow_changes', e.allow_changes,
    'public_link_enabled', e.public_link_enabled,
    'rsvp_open', (e.rsvp_deadline is null or now() <= e.rsvp_deadline))
$$;

create or replace function public._v2_guest_json(g public.guests, e public.events) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('name', g.name, 'seats', g.seats, 'status', g.status, 'token', g.token,
    'confirmed_count', g.confirmed_count, 'event', public._v2_event_json(e))
$$;

-- ---------- 4. Server-side seat rules (package limit, 1–6 seats) ----------
create or replace function public._v2_guest_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; used int;
begin
  if (tg_op = 'INSERT' or new.seats is distinct from old.seats) and (new.seats is null or new.seats < 1 or new.seats > 6) then
    raise exception 'Each guest can have 1 to 6 invites (themselves plus up to 5 extras)' using errcode = '23514';
  end if;
  if new.confirmed_count is not null and new.confirmed_count > new.seats then new.confirmed_count := new.seats; end if;
  select invite_limit into lim from public.events where id = new.event_id;
  if lim is not null and (tg_op = 'INSERT' or new.seats > old.seats) then
    -- one writer at a time per event, so two imports at once can't overshoot the package
    perform pg_advisory_xact_lock(hashtext('rsvp-limit-' || new.event_id::text));
    select coalesce(sum(seats), 0) into used from public.guests
     where event_id = new.event_id and (tg_op = 'INSERT' or id <> new.id);
    if used + new.seats > lim then
      raise exception 'Invite limit reached: % of % used', used, lim using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guests_v2_limits on public.guests;
create trigger guests_v2_limits before insert or update of seats, confirmed_count on public.guests
  for each row execute function public._v2_guest_limits();

-- ---------- 5. Guest functions (no login; the personal token is the key) ----------
create or replace function public.get_invite_v2(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g public.guests; e public.events;
begin
  if p_token is null or length(p_token) < 8 then return null; end if;
  select * into g from public.guests where token::text = p_token;
  if not found then return null; end if;
  select * into e from public.events where id = g.event_id;
  return public._v2_guest_json(g, e);
end $$;

create or replace function public.get_event_public_v2(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e public.events;
begin
  select * into e from public.events where public_code = lower(trim(p_code));
  if not found then return null; end if;
  return public._v2_event_json(e);
end $$;

-- Guest replies with their personal link. p_count = people coming, 1..their seats.
create or replace function public.respond_v2(p_token text, p_status text, p_count int default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.guests; e public.events;
begin
  if p_status not in ('yes', 'no', 'pending') then raise exception 'Invalid reply'; end if;
  select * into g from public.guests where token::text = p_token for update;
  if not found then raise exception 'Invitation not found'; end if;
  select * into e from public.events where id = g.event_id;
  if e.rsvp_deadline is not null and now() > e.rsvp_deadline then raise exception 'RSVP_CLOSED'; end if;
  if g.status in ('yes', 'no') and not e.allow_changes and p_status is distinct from g.status then raise exception 'CHANGES_LOCKED'; end if;
  update public.guests set
    status = p_status,
    confirmed_count = case p_status when 'yes' then least(g.seats, greatest(1, coalesce(p_count, g.seats))) when 'no' then 0 else null end,
    decline_reason = case when p_status = 'no' then nullif(left(trim(coalesce(p_reason, '')), 500), '') else null end,
    replied_at = case when p_status = 'pending' then g.replied_at else now() end
  where id = g.id returning * into g;
  perform public._v2_log(g.event_id, 'guest_reply', jsonb_build_object('guest', g.id, 'status', g.status, 'people', g.confirmed_count));
  return public._v2_guest_json(g, e);
end $$;

-- Reply through the event's shared link. Each person gets ONE seat; they can't add extras.
-- p_token = the token this phone got the first time, so a guest edits their own reply only.
create or replace function public.public_rsvp_v2(p_code text, p_name text, p_status text, p_reason text default null, p_token text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.events; g public.guests; nm text := left(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), 80); used int;
begin
  if p_status not in ('yes', 'no', 'pending') then raise exception 'Invalid reply'; end if;
  if length(nm) < 2 then raise exception 'NAME_REQUIRED'; end if;
  select * into e from public.events where public_code = lower(trim(p_code));
  if not found then raise exception 'Invitation not found'; end if;
  if not e.public_link_enabled then raise exception 'LINK_CLOSED'; end if;
  if e.rsvp_deadline is not null and now() > e.rsvp_deadline then raise exception 'RSVP_CLOSED'; end if;
  if p_token is not null then
    select * into g from public.guests where token::text = p_token and event_id = e.id for update;
  end if;
  if g.id is not null then
    if g.status in ('yes', 'no') and not e.allow_changes and p_status is distinct from g.status then raise exception 'CHANGES_LOCKED'; end if;
    update public.guests set name = case when g.phone is null then nm else g.name end, status = p_status,
      confirmed_count = case p_status when 'yes' then 1 when 'no' then 0 else null end,
      decline_reason = case when p_status = 'no' then nullif(left(trim(coalesce(p_reason, '')), 500), '') else null end,
      replied_at = now()
    where id = g.id returning * into g;
  else
    -- a link reply takes one seat from the package (the trigger enforces the limit)
    insert into public.guests(event_id, name, phone, seats, status, confirmed_count, decline_reason, replied_at)
    values (e.id, nm, null, 1, p_status, case p_status when 'yes' then 1 when 'no' then 0 else null end,
            case when p_status = 'no' then nullif(left(trim(coalesce(p_reason, '')), 500), '') else null end, now())
    returning * into g;
  end if;
  perform public._v2_log(e.id, 'link_reply', jsonb_build_object('guest', g.id, 'status', g.status));
  return public._v2_guest_json(g, e);
end $$;

-- ---------- 6. Host functions ----------
-- Host or admin changes a guest's reply by hand (e.g. the guest phoned them).
create or replace function public.host_set_reply_v2(p_guest uuid, p_status text, p_count int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.guests; r text; s text;
begin
  if p_status not in ('yes', 'no', 'pending') then raise exception 'Invalid reply'; end if;
  select * into g from public.guests where id = p_guest for update;
  if not found then raise exception 'Guest not found'; end if;
  r := public._v2_role(g.event_id); s := public._v2_host_side(g.event_id);
  if coalesce(r, '') not in ('admin', 'host') or (s is not null and g.side is distinct from s) then raise exception 'Not allowed'; end if;
  update public.guests set status = p_status,
    confirmed_count = case p_status when 'yes' then least(g.seats, greatest(1, coalesce(p_count, g.seats))) when 'no' then 0 else null end,
    replied_at = now()
  where id = g.id returning * into g;
  perform public._v2_log(g.event_id, 'host_set_reply', jsonb_build_object('guest', g.id, 'status', g.status, 'people', g.confirmed_count));
  return to_jsonb(g);
end $$;

-- Host or admin changes how many extras a guest may bring (0..5).
create or replace function public.host_set_extras_v2(p_guest uuid, p_extras int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.guests; r text; s text;
begin
  if p_extras is null or p_extras < 0 or p_extras > 5 then raise exception 'Extras must be 0 to 5'; end if;
  select * into g from public.guests where id = p_guest for update;
  if not found then raise exception 'Guest not found'; end if;
  r := public._v2_role(g.event_id); s := public._v2_host_side(g.event_id);
  if coalesce(r, '') not in ('admin', 'host') or (s is not null and g.side is distinct from s) then raise exception 'Not allowed'; end if;
  update public.guests set seats = 1 + p_extras,
    confirmed_count = case when confirmed_count is null then null else least(confirmed_count, 1 + p_extras) end
  where id = g.id returning * into g;
  perform public._v2_log(g.event_id, 'host_set_extras', jsonb_build_object('guest', g.id, 'seats', g.seats));
  return to_jsonb(g);
end $$;

-- RSVP rules for an event: deadline, whether replies can change, shared link on/off.
create or replace function public.host_set_rules_v2(p_event uuid, p_deadline timestamptz, p_allow_changes boolean, p_link_enabled boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  if coalesce(public._v2_role(p_event), '') not in ('admin', 'host') or public._v2_host_side(p_event) is not null then raise exception 'Not allowed'; end if;
  update public.events set rsvp_deadline = p_deadline, allow_changes = coalesce(p_allow_changes, true),
    public_link_enabled = coalesce(p_link_enabled, true)
  where id = p_event returning * into e;
  perform public._v2_log(p_event, 'set_rules', jsonb_build_object('deadline', p_deadline, 'allow_changes', p_allow_changes, 'link', p_link_enabled));
  return to_jsonb(e);
end $$;

-- Door requests waiting for the host, newest first.
create or replace function public.list_exceptions_v2(p_event uuid)
returns setof public.attendance_exceptions language plpgsql stable security definer set search_path = public as $$
begin
  if public._v2_role(p_event) is null then raise exception 'Not allowed'; end if;
  return query select * from public.attendance_exceptions where event_id = p_event order by created_at desc limit 200;
end $$;

-- Host approves or turns down a door request. Door staff can't decide.
create or replace function public.decide_exception_v2(p_id uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare x public.attendance_exceptions; g public.guests;
begin
  select * into x from public.attendance_exceptions where id = p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if coalesce(public._v2_role(x.event_id), '') not in ('admin', 'host') then raise exception 'Only the host can decide'; end if;
  if lower(coalesce(x.requested_by, '')) = public._v2_email() and not public.is_admin() then raise exception 'You can''t approve your own request'; end if;
  if x.status <> 'pending' then return to_jsonb(x); end if;
  update public.attendance_exceptions set status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = nullif(public._v2_email(), ''), decided_at = now()
  where id = x.id returning * into x;
  if p_approve then
    if x.guest_id is not null then
      update public.guests set checked_in_count = coalesce(checked_in_count, 0) + x.people, checked_in_at = coalesce(checked_in_at, now())
       where id = x.guest_id returning * into g;
    else
      -- an unlisted guest becomes a guest row so the counts stay right
      insert into public.guests(event_id, name, phone, seats, status, confirmed_count, checked_in_count, checked_in_at, side, replied_at)
      values (x.event_id, x.name, null, least(6, x.people), 'yes', least(6, x.people), x.people, now(), 'Door', now())
      returning * into g;
      update public.attendance_exceptions set guest_id = g.id where id = x.id;
    end if;
    insert into public.checkin_events(event_id, guest_id, people, by_email) values (x.event_id, g.id, x.people, x.requested_by);
  end if;
  perform public._v2_log(x.event_id, 'decide_exception', jsonb_build_object('request', x.id, 'approved', p_approve));
  return to_jsonb(x);
end $$;

create or replace function public.audit_log_v2(p_event uuid)
returns setof public.audit_logs language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public._v2_role(p_event), '') not in ('admin', 'host') then raise exception 'Not allowed'; end if;
  return query select * from public.audit_logs where event_id = p_event order by created_at desc limit 300;
end $$;

-- ---------- 7. Door functions (no QR: by name, with a count) ----------
create or replace function public.door_list_v2(p_event uuid)
returns table(id uuid, name text, phone text, seats int, status text, confirmed_count int, checked_in_count int,
              decline_reason text, side text, checked_in_at timestamptz)
language plpgsql volatile security definer set search_path = public as $$
begin
  if public._v2_role(p_event) is null then raise exception 'Not allowed'; end if;
  perform public._v2_log(p_event, 'door_open_list', null);
  return query select g.id, g.name::text, g.phone::text, g.seats, g.status::text, g.confirmed_count, g.checked_in_count,
                      g.decline_reason::text, g.side::text, g.checked_in_at
    from public.guests g where g.event_id = p_event order by g.name;
end $$;

-- Check in p_people from a guest's party. Safe if two doors tap at once.
create or replace function public.check_in_v2(p_guest uuid, p_people int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.guests; allowed int; left_ int;
begin
  select * into g from public.guests where id = p_guest for update;   -- one door at a time per guest
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if public._v2_role(g.event_id) is null then raise exception 'Not allowed'; end if;
  allowed := case g.status when 'yes' then coalesce(g.confirmed_count, g.seats) when 'pending' then g.seats else 0 end;
  left_ := greatest(0, allowed - coalesce(g.checked_in_count, 0));
  if p_people is null or p_people < 1 then raise exception 'Enter how many people are arriving'; end if;
  if p_people > left_ then
    return jsonb_build_object('ok', false, 'reason', 'over', 'name', g.name, 'left', left_, 'allowed', allowed,
                              'arrived', g.checked_in_count, 'status', g.status);
  end if;
  update public.guests set checked_in_count = coalesce(checked_in_count, 0) + p_people, checked_in_at = coalesce(checked_in_at, now())
   where id = g.id returning * into g;
  insert into public.checkin_events(event_id, guest_id, people, by_email) values (g.event_id, g.id, p_people, nullif(public._v2_email(), ''));
  perform public._v2_log(g.event_id, 'check_in', jsonb_build_object('guest', g.id, 'people', p_people));
  return jsonb_build_object('ok', true, 'name', g.name, 'people', p_people, 'arrived', g.checked_in_count,
                            'left', greatest(0, allowed - g.checked_in_count), 'status', g.status);
end $$;

-- Door asks the host to let in someone unlisted, or extra people over the allowance.
create or replace function public.request_exception_v2(p_event uuid, p_guest uuid, p_name text, p_people int, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare x public.attendance_exceptions; nm text := trim(coalesce(p_name, ''));
begin
  if public._v2_role(p_event) is null then raise exception 'Not allowed'; end if;
  if p_guest is not null then
    select g.name into nm from public.guests g where g.id = p_guest and g.event_id = p_event;
    if nm is null then raise exception 'Guest not found'; end if;
  end if;
  if length(nm) < 1 then raise exception 'Enter a name'; end if;
  insert into public.attendance_exceptions(event_id, guest_id, name, people, note, requested_by)
  values (p_event, p_guest, left(nm, 120), p_people, nullif(left(trim(coalesce(p_note, '')), 500), ''), nullif(public._v2_email(), ''))
  returning * into x;
  perform public._v2_log(p_event, 'request_exception', jsonb_build_object('request', x.id, 'people', p_people));
  return to_jsonb(x);
end $$;

-- ---------- 8. Who can call what ----------
revoke all on function public._v2_role(uuid), public._v2_host_side(uuid), public._v2_log(uuid, text, jsonb),
  public._v2_event_json(public.events), public._v2_guest_json(public.guests, public.events), public._v2_email() from public, anon, authenticated;
revoke all on function public.get_invite_v2(text), public.get_event_public_v2(text), public.respond_v2(text, text, int, text),
  public.public_rsvp_v2(text, text, text, text, text), public.host_set_reply_v2(uuid, text, int), public.host_set_extras_v2(uuid, int),
  public.host_set_rules_v2(uuid, timestamptz, boolean, boolean), public.list_exceptions_v2(uuid), public.decide_exception_v2(uuid, boolean),
  public.audit_log_v2(uuid), public.door_list_v2(uuid), public.check_in_v2(uuid, int),
  public.request_exception_v2(uuid, uuid, text, int, text) from public;
grant execute on function public.get_invite_v2(text), public.get_event_public_v2(text), public.respond_v2(text, text, int, text),
  public.public_rsvp_v2(text, text, text, text, text) to anon, authenticated;
grant execute on function public.host_set_reply_v2(uuid, text, int), public.host_set_extras_v2(uuid, int),
  public.host_set_rules_v2(uuid, timestamptz, boolean, boolean), public.list_exceptions_v2(uuid), public.decide_exception_v2(uuid, boolean),
  public.audit_log_v2(uuid), public.door_list_v2(uuid), public.check_in_v2(uuid, int),
  public.request_exception_v2(uuid, uuid, text, int, text) to authenticated;

commit;
select 'Upgrade finished' as result;
