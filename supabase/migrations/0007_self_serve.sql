-- ======================================================================
-- Sina: self-serve hosts (additive)
--
-- HOW TO RUN: Supabase → SQL Editor → New query → paste this whole file → Run.
-- Run it only after 0006_pass_sending.sql. Safe to run again. One transaction:
-- if anything doesn't match, it stops and nothing is changed.
--
-- WHAT IT ADDS (the contract is docs/launch/SPEC.md "Database contract"; the
-- calls are listed in docs/launch/API.md)
--  * Tables: packages, prices (both readable by everyone), orders,
--    change_requests, design_requests, profiles, invite_sends (all locked:
--    row security on, no policies; reached only through the functions below).
--  * events: status (draft / active / done / cancelled, every existing event
--    stays 'active'), package, door_addon, send_channel, design_style, paid_at.
--  * event_members: phone, name, user_id, and a third role 'cohost'.
--    email may now be empty (a phone-only co-host or door person).
--  * Phone login: membership checks (event_role, can_host, can_door,
--    member_side, _v2_role, _v2_host_side) now match a member row by email
--    OR phone (from the login) OR user id. Email users get exactly what they
--    got before. A co-host is NOT host or door for any old function.
--  * Draft events: get_invite_v2 / public_rsvp_v2 / get_event_public_v2 give
--    {"closed":"not_ready"}, respond_v2 and door_list_v2 refuse with NOT_READY,
--    except for the event's host / co-host / an admin.
--  * Host, guest-account, payment, sending and admin functions ending in _v2.
--
-- WHAT IT DOES NOT DO
--  * No table, column, row or function the live pages use is removed or renamed.
--    Existing functions keep their signatures and return what they returned.
--  * Nothing is charged and nothing is sent by this file.
--
-- TO REMOVE IT AGAIN: restore the six membership functions and the four
-- invite/door functions from 0000 / 002 / 0005 (run 0005 section 5 and the
-- matching blocks of 0000 and 002 again), then drop the new functions, the
-- seven new tables and the new columns. The role check goes back to
-- ('host','door') only after removing every 'cohost' row.
-- ======================================================================
begin;

-- ---------- 0. Check the database looks the way this file expects ----------
do $$
begin
  if to_regclass('public.pass_sends') is null
     or to_regclass('public.guest_passes') is null
     or to_regprocedure('public._v2_role(uuid)') is null
     or to_regprocedure('public.door_list_v2(uuid)') is null
     or to_regprocedure('public._v2_pass_release(public.events)') is null then
    raise exception 'Stopped, nothing changed. Run 0005_door_pass.sql and 0006_pass_sending.sql first.';
  end if;
end $$;

-- ---------- 1. Prices ----------
create table if not exists public.packages (
  code text primary key check (code ~ '^[a-z_]{2,20}$'),
  name_en text not null,
  name_ar text not null,
  price_fils int not null check (price_fils >= 0),
  invite_limit int not null check (invite_limit > 0),
  door_included boolean not null default false,
  design_included boolean not null default false,
  sort int not null default 0,
  active boolean not null default true
);
insert into public.packages(code, name_en, name_ar, price_fils, invite_limit, door_included, design_included, sort) values
  ('basic',   'Basic',   'الأساسية', 15000, 50,  false, false, 1),
  ('plus',    'Plus',    'بلس',      35000, 150, true,  false, 2),
  ('premium', 'Premium', 'بريميوم',  75000, 400, true,  true,  3)
on conflict (code) do nothing;

create table if not exists public.prices (
  code text primary key,
  price_fils int not null check (price_fils >= 0),
  label_en text,
  label_ar text
);
insert into public.prices(code, price_fils, label_en, label_ar) values
  ('door_addon',    10000, 'Door check-in',     'تسجيل الحضور عند الباب'),
  ('invite_change', 10000, 'Change the invite', 'تعديل الدعوة'),
  ('design',        15000, 'Invite design',     'تصميم الدعوة')
on conflict (code) do nothing;

-- everyone may read the price list; nobody may change it from the app
alter table public.packages enable row level security;
alter table public.prices enable row level security;
revoke all on public.packages, public.prices from public, anon, authenticated;
grant select on public.packages, public.prices to anon, authenticated;
drop policy if exists packages_read on public.packages;
create policy packages_read on public.packages for select to anon, authenticated using (true);
drop policy if exists prices_read on public.prices;
create policy prices_read on public.prices for select to anon, authenticated using (true);

-- ---------- 2. New event and member columns ----------
alter table public.events add column if not exists status text not null default 'active'
  check (status in ('draft', 'active', 'done', 'cancelled'));
alter table public.events add column if not exists package text references public.packages(code);
alter table public.events add column if not exists door_addon boolean not null default false;
alter table public.events add column if not exists send_channel text not null default 'by_hand'
  check (send_channel in ('whatsapp', 'sms', 'by_hand'));
alter table public.events add column if not exists design_style text;
alter table public.events add column if not exists paid_at timestamptz;
create index if not exists events_created_by_status_idx on public.events(created_by, status);

alter table public.event_members add column if not exists phone text;
alter table public.event_members add column if not exists name text;
alter table public.event_members add column if not exists user_id uuid;
alter table public.event_members alter column email drop not null;   -- phone-only members
alter table public.event_members drop constraint if exists event_members_role_check;
alter table public.event_members add constraint event_members_role_check check (role in ('host', 'door', 'cohost'));
create unique index if not exists event_members_event_phone_key on public.event_members(event_id, phone) where phone is not null;
create index if not exists event_members_phone_idx on public.event_members(phone) where phone is not null;
create index if not exists event_members_user_idx on public.event_members(user_id) where user_id is not null;

-- ---------- 3. Orders, requests, profiles ----------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('package', 'door_addon', 'invite_change', 'design')),
  amount_fils int not null check (amount_fils >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled')),
  method text check (method in ('knet', 'card', 'manual')),
  gateway text,
  gateway_ref text,
  related_id uuid,
  package text references public.packages(code),
  door boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists orders_event_idx on public.orders(event_id, created_at desc);
create index if not exists orders_status_idx on public.orders(status, created_at desc);

create table if not exists public.change_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  what text check (what is null or length(what) <= 2000),
  wording text check (wording is null or length(wording) <= 2000),
  colours text check (colours is null or length(colours) <= 500),
  photos text[] not null default '{}',
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'requested', 'in_progress', 'done', 'cancelled')),
  order_id uuid references public.orders(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists change_requests_event_idx on public.change_requests(event_id, created_at desc);

create table if not exists public.design_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  idea text check (idea is null or length(idea) <= 2000),
  wording text check (wording is null or length(wording) <= 2000),
  colours text check (colours is null or length(colours) <= 500),
  photos text[] not null default '{}',
  status text not null default 'requested' check (status in ('requested', 'draft_sent', 'approved', 'cancelled')),
  draft_url text check (draft_url is null or length(draft_url) <= 500),
  order_id uuid references public.orders(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists design_requests_event_idx on public.design_requests(event_id, created_at desc);

create table if not exists public.profiles (
  user_id uuid primary key,
  name text check (name is null or length(name) <= 80),
  phone text,
  email text,
  created_at timestamptz not null default now()
);

-- invites sent on WhatsApp after payment (same pattern as pass_sends; no phones, links or text kept)
create table if not exists public.invite_sends (
  guest_id uuid primary key references public.guests(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'sms')),
  status text not null check (status in ('sending', 'sent', 'delivered', 'read', 'failed')),
  attempts int not null default 0 check (attempts >= 0),
  last_error text check (last_error is null or length(last_error) <= 300),
  provider_msg_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invite_sends_event_idx on public.invite_sends(event_id, status);

alter table public.orders enable row level security;
alter table public.change_requests enable row level security;
alter table public.design_requests enable row level security;
alter table public.profiles enable row level security;
alter table public.invite_sends enable row level security;
revoke all on public.orders, public.change_requests, public.design_requests, public.profiles, public.invite_sends
  from public, anon, authenticated;

-- ---------- 4. Who is who ----------
-- A phone as digits: Arabic digits ok, 00 dropped, 8 digits = Kuwait (965 in front). null = not usable.
-- Same rules as normalizePhone in functions/_shared/pass.ts and App.normPhone in core.js.
create or replace function public._v2_norm_phone(p text) returns text
language plpgsql immutable set search_path = public as $$
declare d text;
begin
  d := regexp_replace(translate(coalesce(p, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g');
  if d like '00%' then d := substr(d, 3); end if;
  if length(d) = 8 then d := '965' || d; end if;
  if length(d) < 8 or length(d) > 15 or d like '0%' or (d like '965%' and length(d) <> 11) then return null; end if;
  return d;
end $$;
create index if not exists guests_norm_phone_idx on public.guests (public._v2_norm_phone(phone)) where phone is not null;

-- The caller's phone (from the login), as digits, or '' when the login has none.
create or replace function public._v2_phone() returns text
language sql stable set search_path = public as $$
  select coalesce(public._v2_norm_phone(auth.jwt() ->> 'phone'), '')
$$;

-- Is this member row the caller? Email (as before), or phone, or user id.
create or replace function public._v2_is_me(p_email text, p_phone text, p_user uuid) returns boolean
language sql stable set search_path = public as $$
  select coalesce(
       (p_email is not null and public._v2_email() <> '' and lower(p_email) = public._v2_email())
    or (p_phone is not null and public._v2_phone() <> '' and p_phone = public._v2_phone())
    or (p_user is not null and p_user = auth.uid()), false)
$$;

-- Old checks, same signatures. Email users get the same answer as before.
-- A 'cohost' row is never host or door here, so no old function lets a co-host in.
create or replace function public.event_role(p_event uuid) returns text
language sql stable security definer set search_path to 'public' as $$
  select m.role from public.event_members m
  where m.event_id = p_event and public._v2_is_me(m.email, m.phone, m.user_id)
    and (m.role <> 'door' or m.expires_at is null or m.expires_at > now())
  order by case m.role when 'host' then 0 when 'door' then 1 else 2 end
  limit 1
$$;

create or replace function public.member_side(p_event uuid) returns text
language sql stable security definer set search_path to 'public' as $$
  select case when public.is_admin() then null else (
    select nullif(trim(m.side), '') from public.event_members m
    where m.event_id = p_event and public._v2_is_me(m.email, m.phone, m.user_id) and m.role = 'host'
    limit 1) end
$$;

create or replace function public._v2_role(p_event uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare r text;
begin
  if public.is_admin() then return 'admin'; end if;
  select case when bool_or(m.role = 'host') then 'host'
              when bool_or(m.role = 'door' and (m.expires_at is null or m.expires_at > now())) then 'door' end
    into r
    from public.event_members m
   where m.event_id = p_event and public._v2_is_me(m.email, m.phone, m.user_id);
  return r;
end $$;

create or replace function public._v2_host_side(p_event uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then null else
    (select nullif(trim(m.side), '') from public.event_members m
      where m.event_id = p_event and public._v2_is_me(m.email, m.phone, m.user_id) and m.role = 'host' limit 1) end
$$;

-- New: 'admin', 'host', 'cohost', 'door' or null.
create or replace function public._v2_my_role(p_event uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare r text;
begin
  if public.is_admin() then return 'admin'; end if;
  select case when bool_or(m.role = 'host') then 'host'
              when bool_or(m.role = 'cohost') then 'cohost'
              when bool_or(m.role = 'door' and (m.expires_at is null or m.expires_at > now())) then 'door' end
    into r
    from public.event_members m
   where m.event_id = p_event and public._v2_is_me(m.email, m.phone, m.user_id);
  return r;
end $$;

-- Raises 'Not allowed' unless the caller is a host (or admin) of the event.
-- p_full: a host limited to one list (side) is refused too.
create or replace function public._v2_need_host(p_event uuid, p_full boolean default false) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_event is null or coalesce(public._v2_role(p_event), '') not in ('admin', 'host') then raise exception 'Not allowed'; end if;
  if p_full and public._v2_host_side(p_event) is not null then raise exception 'Not allowed'; end if;
end $$;

-- A host, co-host or admin may preview a draft event.
create or replace function public._v2_can_preview(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public._v2_my_role(p_event) in ('admin', 'host', 'cohost'), false)
$$;

-- ---------- 5. Draft events stay closed to guests and door staff ----------
create or replace function public.get_invite_v2(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g public.guests; e public.events;
begin
  if p_token is null or length(p_token) < 24 then return null; end if;
  select * into g from public.guests where token::text = p_token;
  if not found then return null; end if;
  select * into e from public.events where id = g.event_id;
  if e.status = 'draft' and not public._v2_can_preview(e.id) then return jsonb_build_object('closed', 'not_ready'); end if;
  return public._v2_guest_json(g, e);
end $$;

create or replace function public.get_event_public_v2(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e public.events;
begin
  if length(coalesce(p_code, '')) < 8 then return null; end if;
  select * into e from public.events where public_code = lower(trim(p_code));
  if not found then return null; end if;
  if e.status = 'draft' and not public._v2_can_preview(e.id) then return jsonb_build_object('closed', 'not_ready'); end if;
  return public._v2_event_json(e);
end $$;

create or replace function public.respond_v2(p_token text, p_status text, p_count int default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.guests; e public.events;
begin
  if p_status not in ('yes', 'no', 'pending') then raise exception 'Invalid reply'; end if;
  if p_token is null or length(p_token) < 24 then raise exception 'Invitation not found'; end if;
  select * into g from public.guests where token::text = p_token for update;
  if not found then raise exception 'Invitation not found'; end if;
  select * into e from public.events where id = g.event_id;
  if e.status = 'draft' and not public._v2_can_preview(e.id) then raise exception 'NOT_READY'; end if;
  if e.rsvp_deadline is not null and now() > e.rsvp_deadline then raise exception 'RSVP_CLOSED'; end if;
  if g.status in ('yes', 'no') and not e.allow_changes and p_status is distinct from g.status then raise exception 'CHANGES_LOCKED'; end if;
  update public.guests set
    status = p_status,
    confirmed_count = case p_status when 'yes' then least(g.seats, greatest(1, coalesce(p_count, g.seats))) when 'no' then 0 else null end,
    decline_reason = case when p_status = 'no' then nullif(left(trim(coalesce(p_reason, '')), 500), '') else null end,
    responded_at = case when p_status = 'pending' then null else now() end
  where id = g.id returning * into g;
  perform public._v2_log(g.event_id, 'guest_reply', jsonb_build_object('guest', g.id, 'status', g.status, 'people', g.confirmed_count));
  return public._v2_guest_json(g, e);
end $$;

create or replace function public.public_rsvp_v2(p_code text, p_name text, p_status text, p_reason text default null, p_token text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.events; g public.guests; nm text := left(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), 80);
begin
  if p_status not in ('yes', 'no') then raise exception 'Invalid reply'; end if;
  if length(nm) < 2 then raise exception 'NAME_REQUIRED'; end if;
  if length(coalesce(p_code, '')) < 8 then raise exception 'Invitation not found'; end if;
  select * into e from public.events where public_code = lower(trim(p_code));
  if not found then raise exception 'Invitation not found'; end if;
  if e.status = 'draft' and not public._v2_can_preview(e.id) then return jsonb_build_object('closed', 'not_ready'); end if;
  if not e.public_link_enabled then raise exception 'LINK_CLOSED'; end if;
  if e.rsvp_deadline is not null and now() > e.rsvp_deadline then raise exception 'RSVP_CLOSED'; end if;
  if p_token is not null then
    select * into g from public.guests where token::text = p_token and event_id = e.id for update;
  end if;
  if g.id is not null then
    if g.status in ('yes', 'no') and not e.allow_changes and p_status is distinct from g.status then raise exception 'CHANGES_LOCKED'; end if;
    update public.guests set name = case when g.phone is null then nm else g.name end, status = p_status,
      confirmed_count = case p_status when 'yes' then least(g.seats, greatest(1, coalesce(g.confirmed_count, 1))) else 0 end,
      decline_reason = case when p_status = 'no' then nullif(left(trim(coalesce(p_reason, '')), 500), '') else null end,
      responded_at = now()
    where id = g.id returning * into g;
  else
    insert into public.guests(event_id, name, phone, seats, status, confirmed_count, decline_reason, responded_at, source)
    values (e.id, nm, null, 1, p_status, case p_status when 'yes' then 1 else 0 end,
            case when p_status = 'no' then nullif(left(trim(coalesce(p_reason, '')), 500), '') else null end, now(), 'link')
    returning * into g;
  end if;
  perform public._v2_log(e.id, 'link_reply', jsonb_build_object('guest', g.id, 'status', g.status));
  return public._v2_guest_json(g, e);
end $$;

-- Same columns as 0005. Door staff get NOT_READY on a draft; host and admin still see it.
create or replace function public.door_list_v2(p_event uuid)
returns table(id uuid, name text, phone text, seats int, status text, confirmed_count int, checked_in_count int,
              decline_reason text, side text, checked_in_at timestamptz, pass_code text)
language plpgsql stable security definer set search_path = public as $$
declare s text := public._v2_host_side(p_event); r text := public._v2_role(p_event);
begin
  if r is null then raise exception 'Not allowed'; end if;
  if r = 'door' and exists (select 1 from public.events e where e.id = p_event and e.status = 'draft') then raise exception 'NOT_READY'; end if;
  return query select g.id, g.name::text, g.phone::text, g.seats, g.status::text, g.confirmed_count, g.checked_in_count,
                      g.decline_reason::text, g.side::text, g.checked_in_at, g.pass_code::text
    from public.guests g where g.event_id = p_event and (s is null or g.side = s) order by g.name;
end $$;

-- "Preview as a guest": what get_invite_v2 shows, for a sample guest. Host, co-host, admin.
create or replace function public.preview_invite_v2(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e public.events;
begin
  if not public._v2_can_preview(p_event) then raise exception 'Not allowed'; end if;
  select * into e from public.events where id = p_event;
  if not found then raise exception 'Not allowed'; end if;
  return jsonb_build_object('name', case when e.lang = 'en' then 'Our guest' else 'ضيفنا' end,
    'seats', 2, 'status', 'pending', 'token', null, 'decline_reason', null, 'confirmed_count', null,
    'event', public._v2_event_json(e), 'pass', null, 'pass_at', null, 'preview', true);
end $$;

-- ---------- 6. Host: create and edit ----------
-- Writes the allowed keys of p into the event. package / door_addon only while it is a draft.
create or replace function public._v2_apply_event(p_event uuid, p jsonb) returns public.events
language plpgsql security definer set search_path = public as $$
declare e public.events; pk text;
begin
  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'Event not found'; end if;
  p := coalesce(p, '{}'::jsonb);
  if (p ? 'package' or p ? 'door_addon') and e.status <> 'draft' then raise exception 'NOT_DRAFT'; end if;
  if p ? 'package' then
    pk := nullif(trim(coalesce(p->>'package', '')), '');
    if pk is not null and not exists (select 1 from public.packages where code = pk and active) then raise exception 'BAD_PACKAGE'; end if;
  end if;
  if p ? 'send_channel' and coalesce(p->>'send_channel', '') not in ('whatsapp', 'sms', 'by_hand') then raise exception 'BAD_CHANNEL'; end if;
  update public.events set
    title            = case when nullif(trim(coalesce(p->>'title', '')), '') is not null then left(trim(p->>'title'), 120) else title end,
    event_type       = case when nullif(trim(coalesce(p->>'event_type', '')), '') is not null then left(trim(p->>'event_type'), 40) else event_type end,
    invite_line      = case when p ? 'invite_line' then left(nullif(trim(p->>'invite_line'), ''), 300) else invite_line end,
    headline         = case when p ? 'headline' then left(nullif(trim(p->>'headline'), ''), 120) else headline end,
    note             = case when p ? 'note' then left(nullif(trim(p->>'note'), ''), 400) else note end,
    venue            = case when p ? 'venue' then left(nullif(trim(p->>'venue'), ''), 200) else venue end,
    map_url          = case when p ? 'map_url' then left(nullif(trim(p->>'map_url'), ''), 500) else map_url end,
    map_spot         = case when p ? 'map_spot' then left(nullif(trim(p->>'map_spot'), ''), 200) else map_spot end,
    message_template = case when p ? 'message_template' then left(nullif(p->>'message_template', ''), 2000) else message_template end,
    starts_at        = case when p ? 'starts_at' then nullif(p->>'starts_at', '')::timestamptz else starts_at end,
    ends_at          = case when p ? 'ends_at' then nullif(p->>'ends_at', '')::timestamptz else ends_at end,
    rsvp_deadline    = case when p ? 'rsvp_deadline' then nullif(p->>'rsvp_deadline', '')::timestamptz else rsvp_deadline end,
    lang             = case when p->>'lang' in ('ar', 'en') then p->>'lang' else lang end,
    card_image_url   = case when p ? 'card_image_url' then left(nullif(p->>'card_image_url', ''), 500) else card_image_url end,
    design_style     = case when p ? 'design_style' then left(nullif(trim(p->>'design_style'), ''), 40) else design_style end,
    theme_accent     = case when coalesce(p->>'theme_accent', '') ~ '^#[0-9a-fA-F]{6}$' then p->>'theme_accent' else theme_accent end,
    theme_paper      = case when coalesce(p->>'theme_paper', '') ~ '^#[0-9a-fA-F]{6}$' then p->>'theme_paper' else theme_paper end,
    send_channel     = case when p ? 'send_channel' then p->>'send_channel' else send_channel end,
    package          = case when p ? 'package' then pk else package end,
    door_addon       = case when p ? 'door_addon' then coalesce((p->>'door_addon')::boolean, false) else door_addon end
  where id = p_event
  returning * into e;
  return e;
end $$;

-- Any signed-in user. A new draft (up to 20 per user), with the caller as its host.
create or replace function public.create_event_v2(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); e public.events; nm text; t text;
begin
  if uid is null then raise exception 'Not allowed'; end if;
  if (select count(*) from public.events where created_by = uid and status = 'draft') >= 20 then raise exception 'TOO_MANY_DRAFTS'; end if;
  t := nullif(trim(coalesce(p->>'title', '')), '');
  insert into public.events(title, status, created_by, invite_limit, lang)
  values (coalesce(left(t, 120), case when p->>'lang' = 'en' then 'New event' else 'مناسبة جديدة' end),
          'draft', uid, 400, case when p->>'lang' in ('ar', 'en') then p->>'lang' else 'ar' end)
  returning * into e;
  select pr.name into nm from public.profiles pr where pr.user_id = uid;
  insert into public.event_members(event_id, email, phone, user_id, name, role)
  values (e.id, nullif(public._v2_email(), ''), nullif(public._v2_phone(), ''), uid, nm, 'host');
  perform public._v2_apply_event(e.id, coalesce(p, '{}'::jsonb));
  perform public._v2_log(e.id, 'create_event', jsonb_build_object('status', 'draft'));
  return e.id;
end $$;

create or replace function public.update_event_v2(p_event uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  perform public._v2_need_host(p_event);
  if (p ? 'package' or p ? 'door_addon') and public._v2_host_side(p_event) is not null then raise exception 'Not allowed'; end if;
  e := public._v2_apply_event(p_event, p);
  return to_jsonb(e);
end $$;

-- Events the caller hosts, co-hosts or works the door for, with counts.
create or replace function public.my_events_v2() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  if auth.uid() is null and public._v2_email() = '' and public._v2_phone() = '' then raise exception 'Not allowed'; end if;
  with mine as (
    select m.event_id,
           case when bool_or(m.role = 'host') then 'host' when bool_or(m.role = 'cohost') then 'cohost' else 'door' end as role,
           min(nullif(trim(m.side), '')) filter (where m.role = 'host') as side
      from public.event_members m
     where public._v2_is_me(m.email, m.phone, m.user_id)
       and (m.role <> 'door' or m.expires_at is null or m.expires_at > now())
     group by m.event_id
  ), rows_ as (
    select e.*, mine.role as my_role, mine.side as my_side,
           (select jsonb_build_object(
              'invited', count(*), 'invited_people', coalesce(sum(g.seats), 0),
              'yes', count(*) filter (where g.status = 'yes'),
              'yes_people', coalesce(sum(coalesce(g.confirmed_count, g.seats)) filter (where g.status = 'yes'), 0),
              'no', count(*) filter (where g.status = 'no'),
              'no_reply', count(*) filter (where g.status = 'pending'),
              'arrived', coalesce(sum(g.checked_in_count), 0))
              from public.guests g
             where g.event_id = e.id and (mine.role <> 'host' or mine.side is null or g.side = mine.side)) as counts,
           (select pk.door_included from public.packages pk where pk.code = e.package) as pk_door
      from mine join public.events e on e.id = mine.event_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'title', r.title, 'event_type', r.event_type, 'starts_at', r.starts_at, 'ends_at', r.ends_at,
      'venue', r.venue, 'card_image_url', r.card_image_url, 'lang', r.lang, 'public_code', r.public_code,
      'role', r.my_role, 'status', r.status, 'package', r.package, 'door_addon', r.door_addon,
      'door', coalesce(r.pk_door, false) or r.door_addon, 'send_channel', r.send_channel,
      'invite_limit', r.invite_limit, 'paid_at', r.paid_at, 'counts', r.counts)
      order by (r.starts_at is not null and r.starts_at < now() - interval '1 day'),
               case when r.starts_at is null or r.starts_at >= now() - interval '1 day' then r.starts_at end asc nulls first,
               r.starts_at desc), '[]'::jsonb)
    into res from rows_ r;
  return res;
end $$;

-- ---------- 7. Team ----------
create or replace function public._v2_member_json(m public.event_members) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', m.id, 'event_id', m.event_id, 'name', m.name, 'role', m.role, 'phone', m.phone,
    'email', m.email, 'side', m.side, 'expires_at', m.expires_at, 'created_at', m.created_at,
    'is_me', public._v2_is_me(m.email, m.phone, m.user_id))
$$;

create or replace function public.list_members_v2(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._v2_need_host(p_event);
  return coalesce((select jsonb_agg(public._v2_member_json(m) order by case m.role when 'host' then 0 when 'cohost' then 1 else 2 end, m.created_at)
                     from public.event_members m where m.event_id = p_event), '[]'::jsonb);
end $$;

create or replace function public.add_member_v2(p_event uuid, p_name text, p_phone text, p_email text, p_role text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ph text := public._v2_norm_phone(p_phone); em text := lower(nullif(trim(coalesce(p_email, '')), '')); m public.event_members;
begin
  perform public._v2_need_host(p_event, true);
  if p_role not in ('cohost', 'door') then raise exception 'BAD_ROLE'; end if;
  if nullif(trim(coalesce(p_phone, '')), '') is not null and ph is null then raise exception 'BAD_PHONE'; end if;
  if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'BAD_EMAIL'; end if;
  if ph is null and em is null then raise exception 'PHONE_OR_EMAIL_REQUIRED'; end if;
  if exists (select 1 from public.event_members x where x.event_id = p_event
               and ((em is not null and lower(x.email) = em) or (ph is not null and x.phone = ph))) then
    raise exception 'ALREADY_MEMBER';
  end if;
  insert into public.event_members(event_id, email, phone, name, role)
  values (p_event, em, ph, left(nullif(trim(coalesce(p_name, '')), ''), 80), p_role)
  returning * into m;
  perform public._v2_log(p_event, 'add_member', jsonb_build_object('member', m.id, 'role', m.role));
  return public._v2_member_json(m);
end $$;

create or replace function public.remove_member_v2(p_member uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.event_members;
begin
  select * into m from public.event_members where id = p_member;
  if not found then raise exception 'Not allowed'; end if;
  perform public._v2_need_host(m.event_id, true);
  if m.role = 'host' then raise exception 'CANNOT_REMOVE_HOST'; end if;
  delete from public.event_members where id = m.id;
  perform public._v2_log(m.event_id, 'remove_member', jsonb_build_object('member', m.id, 'role', m.role));
  return jsonb_build_object('ok', true, 'id', m.id);
end $$;

-- Co-host view of the list: never phones or tokens.
create or replace function public.cohost_guests_v2(p_event uuid)
returns table(id uuid, name text, seats int, status text, confirmed_count int, checked_in_count int, side text, responded_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare r text := public._v2_my_role(p_event); s text := public._v2_host_side(p_event);
begin
  if coalesce(r, '') not in ('admin', 'host', 'cohost') then raise exception 'Not allowed'; end if;
  return query select g.id, g.name::text, g.seats, g.status::text, g.confirmed_count, g.checked_in_count, g.side::text, g.responded_at
    from public.guests g where g.event_id = p_event and (r <> 'host' or s is null or g.side = s) order by g.name;
end $$;

-- ---------- 8. Prices and checkout ----------
-- The price is always worked out here, never taken from the app.
create or replace function public._v2_quote(p_event uuid, p_package text, p_door boolean) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pk public.packages; items jsonb := '[]'::jsonb; total int := 0; used int; door_p public.prices; des public.prices;
begin
  select * into pk from public.packages where code = p_package and active;
  if not found then raise exception 'BAD_PACKAGE'; end if;
  select coalesce(sum(g.seats), 0) into used from public.guests g where g.event_id = p_event;
  items := items || jsonb_build_object('kind', 'package', 'code', pk.code, 'label_en', pk.name_en, 'label_ar', pk.name_ar, 'amount_fils', pk.price_fils);
  total := total + pk.price_fils;
  if coalesce(p_door, false) and not pk.door_included then
    select * into door_p from public.prices where code = 'door_addon';
    items := items || jsonb_build_object('kind', 'door_addon', 'code', 'door_addon', 'label_en', door_p.label_en, 'label_ar', door_p.label_ar, 'amount_fils', door_p.price_fils);
    total := total + door_p.price_fils;
  end if;
  -- a design approved for free (because a design package was picked) is charged if the package changes
  if not pk.design_included and exists (
       select 1 from public.design_requests d join public.orders o on o.id = d.order_id
        where d.event_id = p_event and d.status = 'approved' and o.gateway = 'included') then
    select * into des from public.prices where code = 'design';
    items := items || jsonb_build_object('kind', 'design', 'code', 'design', 'label_en', des.label_en, 'label_ar', des.label_ar, 'amount_fils', des.price_fils);
    total := total + des.price_fils;
  end if;
  return jsonb_build_object('items', items, 'total_fils', total, 'guest_count', used, 'invite_limit', pk.invite_limit,
    'fits', used <= pk.invite_limit, 'package', pk.code,
    'door', pk.door_included or coalesce(p_door, false));
end $$;

create or replace function public.quote_v2(p_event uuid, p_package text, p_door boolean) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._v2_need_host(p_event, true);
  return public._v2_quote(p_event, p_package, p_door);
end $$;

create or replace function public.start_checkout_v2(p_event uuid, p_package text, p_door boolean, p_method text) returns uuid
language plpgsql security definer set search_path = public as $$
declare e public.events; q jsonb; pk public.packages; o public.orders;
begin
  perform public._v2_need_host(p_event, true);
  if coalesce(p_method, '') not in ('knet', 'card') then raise exception 'BAD_METHOD'; end if;
  select * into e from public.events where id = p_event for update;
  if e.status <> 'draft' then raise exception 'NOT_DRAFT'; end if;
  q := public._v2_quote(p_event, p_package, p_door);
  if not (q->>'fits')::boolean then raise exception 'PACKAGE_TOO_SMALL'; end if;
  select * into pk from public.packages where code = p_package;
  update public.events set package = pk.code, door_addon = coalesce(p_door, false) and not pk.door_included where id = p_event;
  insert into public.orders(event_id, kind, amount_fils, status, method, gateway, package, door, created_by)
  values (p_event, 'package', (q->>'total_fils')::int, 'pending', p_method, null, pk.code, coalesce(p_door, false) and not pk.door_included, auth.uid())
  returning * into o;
  perform public._v2_log(p_event, 'checkout', jsonb_build_object('order', o.id, 'package', pk.code, 'amount_fils', o.amount_fils));
  return o.id;
end $$;

-- ---------- 9. Changes and design ----------
create or replace function public.request_change_v2(p_event uuid, p_what text, p_wording text, p_colours text, p_photos text[], p_method text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.events; cr public.change_requests; o public.orders; price int;
begin
  perform public._v2_need_host(p_event, true);
  if coalesce(p_method, '') not in ('knet', 'card') then raise exception 'BAD_METHOD'; end if;
  select * into e from public.events where id = p_event;
  if e.status = 'draft' then raise exception 'IS_DRAFT'; end if;   -- a draft is changed directly, for free
  select price_fils into price from public.prices where code = 'invite_change';
  insert into public.change_requests(event_id, what, wording, colours, photos, status, created_by)
  values (p_event, left(nullif(trim(coalesce(p_what, '')), ''), 2000), left(nullif(trim(coalesce(p_wording, '')), ''), 2000),
          left(nullif(trim(coalesce(p_colours, '')), ''), 500), coalesce(p_photos[1:10], '{}'), 'awaiting_payment', auth.uid())
  returning * into cr;
  insert into public.orders(event_id, kind, amount_fils, status, method, related_id, created_by)
  values (p_event, 'invite_change', price, 'pending', p_method, cr.id, auth.uid()) returning * into o;
  update public.change_requests set order_id = o.id where id = cr.id;
  perform public._v2_log(p_event, 'request_change', jsonb_build_object('request', cr.id, 'order', o.id));
  return jsonb_build_object('request_id', cr.id, 'order_id', o.id);
end $$;

create or replace function public.request_design_v2(p_event uuid, p_idea text, p_wording text, p_colours text, p_photos text[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare d public.design_requests;
begin
  perform public._v2_need_host(p_event, true);
  insert into public.design_requests(event_id, idea, wording, colours, photos, status, created_by)
  values (p_event, left(nullif(trim(coalesce(p_idea, '')), ''), 2000), left(nullif(trim(coalesce(p_wording, '')), ''), 2000),
          left(nullif(trim(coalesce(p_colours, '')), ''), 500), coalesce(p_photos[1:10], '{}'), 'requested', auth.uid())
  returning * into d;
  perform public._v2_log(p_event, 'request_design', jsonb_build_object('request', d.id));
  return d.id;
end $$;

-- ---------- 10. Payment (test gateway / by hand) ----------
-- Server only (checkout-test function, admin_mark_paid_v2). Safe to call twice: a paid order is left as it is.
create or replace function public._v2_mark_paid(p_order uuid, p_gateway text, p_ref text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders; pk public.packages;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status = 'paid' then return jsonb_build_object('order_id', o.id, 'status', 'paid', 'already', true); end if;
  update public.orders set status = 'paid', paid_at = now(), gateway = coalesce(nullif(trim(p_gateway), ''), gateway, 'manual'),
    gateway_ref = left(coalesce(nullif(trim(p_ref), ''), gateway_ref), 200)
   where id = o.id returning * into o;
  if o.kind = 'package' then
    select * into pk from public.packages where code = o.package;
    update public.events set status = case when status = 'draft' then 'active' else status end,
      package = coalesce(pk.code, package), door_addon = o.door,
      invite_limit = coalesce(pk.invite_limit, invite_limit), paid_at = coalesce(paid_at, now())
     where id = o.event_id;
  elsif o.kind = 'door_addon' then
    update public.events set door_addon = true where id = o.event_id;
  elsif o.kind = 'invite_change' then
    update public.change_requests set status = 'requested' where id = o.related_id and status = 'awaiting_payment';
  elsif o.kind = 'design' then
    update public.design_requests set status = 'approved' where id = o.related_id and status in ('requested', 'draft_sent');
  end if;
  insert into public.audit_logs(event_id, actor, action, details)
  values (o.event_id, nullif(public._v2_email(), ''), 'order_paid', jsonb_build_object('order', o.id, 'kind', o.kind, 'amount_fils', o.amount_fils, 'gateway', o.gateway));
  return jsonb_build_object('order_id', o.id, 'status', 'paid', 'already', false);
end $$;

-- Server only. A pending order the gateway turned down.
create or replace function public._v2_mark_failed(p_order uuid, p_gateway text, p_ref text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status <> 'pending' then return jsonb_build_object('order_id', o.id, 'status', o.status, 'already', true); end if;
  update public.orders set status = 'failed', gateway = coalesce(nullif(trim(p_gateway), ''), gateway),
    gateway_ref = left(coalesce(nullif(trim(p_ref), ''), gateway_ref), 200) where id = o.id;
  insert into public.audit_logs(event_id, actor, action, details)
  values (o.event_id, null, 'order_failed', jsonb_build_object('order', o.id, 'kind', o.kind));
  return jsonb_build_object('order_id', o.id, 'status', 'failed', 'already', false);
end $$;

-- The host approves the design draft. Free (and paid at once) when the event's package includes design.
create or replace function public.approve_design_v2(p_request uuid, p_method text) returns uuid
language plpgsql security definer set search_path = public as $$
declare d public.design_requests; e public.events; free_ boolean; price int; o public.orders;
begin
  select * into d from public.design_requests where id = p_request for update;
  if not found then raise exception 'Not allowed'; end if;
  perform public._v2_need_host(d.event_id, true);
  if d.status = 'approved' then return d.order_id; end if;
  if d.status <> 'draft_sent' then raise exception 'NO_DRAFT_YET'; end if;
  select * into e from public.events where id = d.event_id;
  free_ := coalesce((select pk.design_included from public.packages pk where pk.code = e.package), false);
  if not free_ and coalesce(p_method, '') not in ('knet', 'card') then raise exception 'BAD_METHOD'; end if;
  -- an unpaid order for this request already waiting: give that one back
  select * into o from public.orders where related_id = d.id and kind = 'design' and status = 'pending' order by created_at desc limit 1;
  if found and not free_ then return o.id; end if;
  select price_fils into price from public.prices where code = 'design';
  insert into public.orders(event_id, kind, amount_fils, status, method, gateway, related_id, created_by)
  values (d.event_id, 'design', case when free_ then 0 else price end, 'pending',
          case when free_ then null else p_method end, case when free_ then 'included' end, d.id, auth.uid())
  returning * into o;
  update public.design_requests set order_id = o.id where id = d.id;
  if free_ then perform public._v2_mark_paid(o.id, 'included', null); end if;
  perform public._v2_log(d.event_id, 'approve_design', jsonb_build_object('request', d.id, 'order', o.id, 'free', free_));
  return o.id;
end $$;

create or replace function public._v2_order_json(o public.orders) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', o.id, 'event_id', o.event_id, 'kind', o.kind, 'amount_fils', o.amount_fils, 'status', o.status,
    'method', o.method, 'gateway', o.gateway, 'package', o.package, 'door', o.door, 'related_id', o.related_id,
    'created_at', o.created_at, 'paid_at', o.paid_at)
$$;

create or replace function public.event_orders_v2(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._v2_need_host(p_event, true);
  return coalesce((select jsonb_agg(public._v2_order_json(o) order by o.created_at desc) from public.orders o where o.event_id = p_event), '[]'::jsonb);
end $$;

create or replace function public.event_requests_v2(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._v2_need_host(p_event);
  return coalesce((select jsonb_agg(x.j order by x.at desc) from (
      select c.created_at at, jsonb_build_object('kind', 'change', 'id', c.id, 'event_id', c.event_id, 'what', c.what, 'wording', c.wording,
        'colours', c.colours, 'photos', to_jsonb(c.photos), 'status', c.status, 'order_id', c.order_id, 'created_at', c.created_at, 'done_at', c.done_at) j
        from public.change_requests c where c.event_id = p_event
      union all
      select d.created_at, jsonb_build_object('kind', 'design', 'id', d.id, 'event_id', d.event_id, 'idea', d.idea, 'wording', d.wording,
        'colours', d.colours, 'photos', to_jsonb(d.photos), 'status', d.status, 'draft_url', d.draft_url, 'order_id', d.order_id, 'created_at', d.created_at)
        from public.design_requests d where d.event_id = p_event) x), '[]'::jsonb);
end $$;

create or replace function public.order_status_v2(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o public.orders; e public.events;
begin
  select * into o from public.orders where id = p_order;
  if not found then raise exception 'Not allowed'; end if;
  perform public._v2_need_host(o.event_id, true);
  select * into e from public.events where id = o.event_id;
  return public._v2_order_json(o) || jsonb_build_object('event_title', e.title, 'event_status', e.status);
end $$;

-- ---------- 11. Guests with an account ----------
create or replace function public.my_invites_v2() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ph text := public._v2_phone();
begin
  if auth.uid() is null then raise exception 'Not allowed'; end if;
  if ph = '' then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x.j order by x.past, x.up_at asc nulls last, x.past_at desc nulls last) from (
    select coalesce(coalesce(e.ends_at, e.starts_at + interval '6 hours') < now(), false) as past,
           case when coalesce(e.ends_at, e.starts_at + interval '6 hours') < now() then null else e.starts_at end as up_at,
           case when coalesce(e.ends_at, e.starts_at + interval '6 hours') < now() then e.starts_at end as past_at,
           jsonb_build_object('token', g.token, 'status', g.status, 'seats', g.seats, 'confirmed_count', g.confirmed_count,
             'responded_at', g.responded_at,
             'past', coalesce(coalesce(e.ends_at, e.starts_at + interval '6 hours') < now(), false),
             'event', jsonb_build_object('title', coalesce(nullif(trim(e.headline), ''), e.title), 'starts_at', e.starts_at,
               'venue', e.venue, 'map_url', e.map_url, 'card_image_url', e.card_image_url, 'lang', e.lang)) j
      from public.guests g join public.events e on e.id = g.event_id
     where g.phone is not null and public._v2_norm_phone(g.phone) = ph and e.status in ('active', 'done')) x), '[]'::jsonb);
end $$;

create or replace function public.my_profile_v2() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pr public.profiles;
begin
  if auth.uid() is null then raise exception 'Not allowed'; end if;
  select * into pr from public.profiles where user_id = auth.uid();
  return jsonb_build_object('user_id', auth.uid(), 'name', pr.name,
    'phone', coalesce(nullif(public._v2_phone(), ''), pr.phone),
    'email', coalesce(nullif(public._v2_email(), ''), pr.email),
    'is_admin', public.is_admin());
end $$;

-- The profile email is only contact information: access always comes from the login itself.
create or replace function public.save_profile_v2(p_name text, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare em text := lower(nullif(trim(coalesce(p_email, '')), '')); nm text := left(nullif(trim(coalesce(p_name, '')), ''), 80);
begin
  if auth.uid() is null then raise exception 'Not allowed'; end if;
  if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'BAD_EMAIL'; end if;
  insert into public.profiles(user_id, name, phone, email)
  values (auth.uid(), nm, nullif(public._v2_phone(), ''), em)
  on conflict (user_id) do update set name = excluded.name, email = excluded.email,
    phone = coalesce(excluded.phone, public.profiles.phone);
  update public.event_members m set name = nm where m.user_id = auth.uid() and m.role = 'host' and nm is not null;
  return public.my_profile_v2();
end $$;

-- ---------- 12. Invites on WhatsApp after payment (send-invites function) ----------
-- Due: paid active event that sends by WhatsApp, not over yet, guest has a phone, hasn't replied,
-- wasn't sent by hand (sent_at empty), and not sent yet (or failed < 3 times, waiting 10 min x tries).
-- A 'sending' row older than 15 minutes counts as failed with no retry (it may have gone out).
create or replace function public.invite_send_claim(p_limit int default 25)
returns table(guest_id uuid, event_id uuid, phone text, name text, people int, token text, lang text,
              event_title text, starts_at timestamptz, venue text)
language plpgsql volatile security definer set search_path = public as $$
declare lim int := least(greatest(coalesce(p_limit, 25), 1), 200);
begin
  update public.invite_sends s set status = 'failed', last_error = 'unclear:no_result', attempts = greatest(s.attempts, 3)
   where s.status = 'sending' and s.updated_at < now() - interval '15 minutes';
  return query
  with cand as (
    select g.id as gid, g.event_id as eid
      from public.guests g
      join public.events e on e.id = g.event_id
      left join public.invite_sends s on s.guest_id = g.id
     where e.status = 'active' and e.paid_at is not null and e.send_channel = 'whatsapp'
       and (e.starts_at is null or e.starts_at > now())
       and g.status = 'pending' and g.sent_at is null
       and nullif(trim(coalesce(g.phone, '')), '') is not null
       and (s.guest_id is null
            or (s.status = 'failed' and s.attempts < 3 and s.updated_at <= now() - make_interval(mins => 10 * s.attempts)))
     order by e.paid_at, g.created_at, g.id
     limit lim
     for update of g skip locked
  ), got as (
    insert into public.invite_sends as s (guest_id, event_id, channel, status, attempts, created_at, updated_at)
    select cand.gid, cand.eid, 'whatsapp', 'sending', 1, now(), now() from cand
    on conflict on constraint invite_sends_pkey do update
       set status = 'sending', attempts = s.attempts + 1, provider_msg_id = null, updated_at = now()
     where s.status = 'failed' and s.attempts < 3 and s.updated_at <= now() - make_interval(mins => 10 * s.attempts)
    returning s.guest_id as gid
  )
  select g.id, g.event_id, g.phone::text, g.name::text, g.seats::int, g.token::text, e.lang::text,
         coalesce(nullif(trim(e.headline), ''), e.title)::text, e.starts_at, e.venue::text
    from got join public.guests g on g.id = got.gid join public.events e on e.id = g.event_id
   order by g.id;
end $$;

-- Same meaning as pass_send_result (p_ok true / false / null; error prefixes final: unclear: config:).
-- A sent invite marks the guest as sent (guests.sent_at), so it leaves the host's send-by-hand list.
create or replace function public.invite_send_result(p_guest uuid, p_ok boolean, p_msg_id text, p_error text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare s public.invite_sends; err text := left(regexp_replace(coalesce(p_error, ''), '[+]?[0-9][0-9 -]{5,}[0-9]', '…', 'g'), 300);
begin
  select * into s from public.invite_sends where guest_id = p_guest for update;
  if not found or s.status <> 'sending' then return null; end if;
  if p_ok is null then
    if s.attempts <= 1 and s.last_error is null then delete from public.invite_sends where guest_id = p_guest; return 'released'; end if;
    update public.invite_sends set status = 'failed', attempts = greatest(0, s.attempts - 1) where guest_id = p_guest;
    return 'released';
  end if;
  if p_ok then
    update public.invite_sends set status = 'sent', provider_msg_id = nullif(left(trim(coalesce(p_msg_id, '')), 200), ''),
      last_error = null, updated_at = now() where guest_id = p_guest;
    update public.guests set sent_at = coalesce(sent_at, now()) where id = p_guest;
    perform public._v2_log(s.event_id, 'invite_sent', jsonb_build_object('guest', p_guest, 'channel', 'whatsapp', 'attempt', s.attempts));
    return 'sent';
  end if;
  if err like 'config:%' then
    update public.invite_sends set status = 'failed', last_error = err, attempts = greatest(0, s.attempts - 1), updated_at = now()
     where guest_id = p_guest;
    return 'failed';
  end if;
  update public.invite_sends set status = 'failed', last_error = coalesce(nullif(err, ''), 'error'),
    attempts = case when err like 'final:%' or err like 'unclear:%' then greatest(s.attempts, 3) else s.attempts end, updated_at = now()
   where guest_id = p_guest;
  perform public._v2_log(s.event_id, 'invite_send_failed', jsonb_build_object('guest', p_guest, 'attempt', s.attempts, 'error', left(coalesce(nullif(err, ''), 'error'), 80)));
  return 'failed';
end $$;

-- WhatsApp delivery news for an invite (from whatsapp-webhook). Forward only.
create or replace function public.invite_send_status_update(p_msg_id text, p_status text, p_error text default null, p_guest uuid default null)
returns text language plpgsql volatile security definer set search_path = public as $$
declare s public.invite_sends; rk_old int; rk_new int; err text := left(regexp_replace(coalesce(p_error, ''), '[+]?[0-9][0-9 -]{5,}[0-9]', '…', 'g'), 300);
begin
  if coalesce(trim(p_msg_id), '') = '' or p_status not in ('sent', 'delivered', 'read', 'failed') then return null; end if;
  select * into s from public.invite_sends where provider_msg_id = trim(p_msg_id) for update;
  if not found and p_guest is not null then
    select * into s from public.invite_sends x
     where x.guest_id = p_guest and (x.status = 'sending' or (x.status = 'failed' and x.last_error like 'unclear:%')) for update;
    if not found then return null; end if;
    if p_status = 'failed' then
      if s.status <> 'sending' then return null; end if;
      update public.invite_sends set status = 'failed', provider_msg_id = left(trim(p_msg_id), 200), last_error = coalesce(nullif(err, ''), 'failed'),
        attempts = case when err like 'final:%' then greatest(s.attempts, 3) else s.attempts end, updated_at = now() where guest_id = s.guest_id;
      return 'failed';
    end if;
    update public.invite_sends set status = p_status, provider_msg_id = left(trim(p_msg_id), 200), last_error = null, updated_at = now()
     where guest_id = s.guest_id;
    update public.guests set sent_at = coalesce(sent_at, now()) where id = s.guest_id;
    return p_status;
  end if;
  if not found then return null; end if;
  rk_old := case s.status when 'sending' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 9 end;
  if p_status = 'failed' then
    if rk_old > 1 then return null; end if;
    update public.invite_sends set status = 'failed', last_error = coalesce(nullif(err, ''), 'failed'),
      attempts = case when err like 'final:%' then greatest(s.attempts, 3) else s.attempts end, updated_at = now() where guest_id = s.guest_id;
    -- the guest goes back on the host's send-by-hand list
    update public.guests set sent_at = null where id = s.guest_id and status = 'pending';
    perform public._v2_log(s.event_id, 'invite_send_failed', jsonb_build_object('guest', s.guest_id, 'attempt', s.attempts, 'error', left(coalesce(nullif(err, ''), 'failed'), 80)));
    return 'failed';
  end if;
  rk_new := case p_status when 'sent' then 1 when 'delivered' then 2 else 3 end;
  if rk_new <= rk_old or rk_old = 9 then return null; end if;
  update public.invite_sends set status = p_status, updated_at = now() where guest_id = s.guest_id;
  return p_status;
end $$;

-- Host/admin: how the WhatsApp invites are going (counts only).
create or replace function public.invite_send_status_v2(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e public.events; res jsonb;
begin
  perform public._v2_need_host(p_event);
  select * into e from public.events where id = p_event;
  select jsonb_build_object('channel', e.send_channel, 'paid', e.paid_at is not null,
    'counts', jsonb_build_object(
      'sending', count(*) filter (where s.status = 'sending'), 'sent', count(*) filter (where s.status = 'sent'),
      'delivered', count(*) filter (where s.status = 'delivered'), 'read', count(*) filter (where s.status = 'read'),
      'failed', count(*) filter (where s.status = 'failed')))
    into res from public.invite_sends s where s.event_id = p_event;
  return res;
end $$;

-- ---------- 13. Admin (the Sina team) ----------
create or replace function public._v2_need_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
end $$;

create or replace function public._v2_event_host_json(p_event uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', m.name, 'email', m.email, 'phone', m.phone)
    from public.event_members m where m.event_id = p_event and m.role = 'host' order by m.created_at limit 1
$$;

create or replace function public.admin_orders_v2(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._v2_need_admin();
  return coalesce((select jsonb_agg(public._v2_order_json(o) || jsonb_build_object('event_title', e.title, 'event_status', e.status,
                     'gateway_ref', o.gateway_ref, 'host', public._v2_event_host_json(e.id)) order by o.created_at desc)
                     from public.orders o join public.events e on e.id = o.event_id
                    where p_status is null or o.status = p_status), '[]'::jsonb);
end $$;

create or replace function public.admin_requests_v2() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._v2_need_admin();
  return coalesce((select jsonb_agg(x.j order by x.at desc) from (
      select c.created_at at, jsonb_build_object('kind', 'change', 'id', c.id, 'event_id', c.event_id, 'event_title', e.title,
        'host', public._v2_event_host_json(e.id), 'what', c.what, 'wording', c.wording, 'colours', c.colours, 'photos', to_jsonb(c.photos),
        'status', c.status, 'order_id', c.order_id, 'created_at', c.created_at, 'done_at', c.done_at) j
        from public.change_requests c join public.events e on e.id = c.event_id
      union all
      select d.created_at, jsonb_build_object('kind', 'design', 'id', d.id, 'event_id', d.event_id, 'event_title', e.title,
        'host', public._v2_event_host_json(e.id), 'idea', d.idea, 'wording', d.wording, 'colours', d.colours, 'photos', to_jsonb(d.photos),
        'status', d.status, 'draft_url', d.draft_url, 'order_id', d.order_id, 'created_at', d.created_at)
        from public.design_requests d join public.events e on e.id = d.event_id) x), '[]'::jsonb);
end $$;

create or replace function public.admin_set_request_v2(p_kind text, p_id uuid, p_status text, p_draft_url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.change_requests; d public.design_requests;
begin
  perform public._v2_need_admin();
  if p_kind = 'change' then
    if p_status not in ('awaiting_payment', 'requested', 'in_progress', 'done', 'cancelled') then raise exception 'BAD_STATUS'; end if;
    update public.change_requests set status = p_status, done_at = case when p_status = 'done' then now() else null end
     where id = p_id returning * into c;
    if not found then raise exception 'NOT_FOUND'; end if;
    perform public._v2_log(c.event_id, 'admin_set_request', jsonb_build_object('kind', 'change', 'request', c.id, 'status', p_status));
    return to_jsonb(c);
  elsif p_kind = 'design' then
    if p_status not in ('requested', 'draft_sent', 'approved', 'cancelled') then raise exception 'BAD_STATUS'; end if;
    update public.design_requests set status = p_status,
      draft_url = coalesce(left(nullif(trim(coalesce(p_draft_url, '')), ''), 500), draft_url)
     where id = p_id returning * into d;
    if not found then raise exception 'NOT_FOUND'; end if;
    perform public._v2_log(d.event_id, 'admin_set_request', jsonb_build_object('kind', 'design', 'request', d.id, 'status', p_status));
    return to_jsonb(d);
  end if;
  raise exception 'BAD_KIND';
end $$;

create or replace function public.admin_set_package_v2(p_event uuid, p_package text, p_door boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pk public.packages; e public.events;
begin
  perform public._v2_need_admin();
  select * into pk from public.packages where code = p_package;
  if not found then raise exception 'BAD_PACKAGE'; end if;
  update public.events set package = pk.code, door_addon = coalesce(p_door, false) and not pk.door_included, invite_limit = pk.invite_limit
   where id = p_event returning * into e;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public._v2_log(p_event, 'admin_set_package', jsonb_build_object('package', pk.code, 'door', p_door));
  return to_jsonb(e);
end $$;

create or replace function public.admin_mark_paid_v2(p_order uuid, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public._v2_need_admin();
  update public.orders set method = coalesce(method, 'manual') where id = p_order;
  return public._v2_mark_paid(p_order, 'manual', 'by ' || coalesce(nullif(public._v2_email(), ''), 'admin') || coalesce(': ' || left(nullif(trim(p_note), ''), 150), ''));
end $$;

-- ---------- 14. Account deletion also covers phone logins ----------
-- Same signatures. Email accounts: the same rows as before. Plus member rows with this user id, and the profile.
create or replace function public.my_account_summary()
returns json language sql stable security definer set search_path to 'public' as $$
  with me as (select public.current_email() as email),
  mine as (
    select m.event_id, m.role from public.event_members m
     where public._v2_is_me(m.email, m.phone, m.user_id)
  ),
  solo as (
    select e.id, e.title, e.starts_at, (select count(*) from public.guests g where g.event_id = e.id) as guests
      from public.events e
      join mine on mine.event_id = e.id and mine.role = 'host'
     where not exists (
       select 1 from public.event_members o
        where o.event_id = e.id and o.role = 'host' and not public._v2_is_me(o.email, o.phone, o.user_id))
  )
  select json_build_object(
    'email', (select email from me),
    'is_admin', public.is_admin(),
    'memberships', (select count(*) from mine),
    'events_to_delete', coalesce((select json_agg(json_build_object(
        'id', id, 'title', title, 'starts_at', starts_at, 'guests', guests) order by starts_at) from solo), '[]'::json)
  )
$$;

create or replace function public.delete_account_data(p_user uuid, p_email text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  em text := lower(trim(coalesce(p_email, '')));
  ev_ids uuid[];
  n_guests integer := 0;
  n_members integer := 0;
begin
  if p_user is null then raise exception 'user required'; end if;
  if exists (select 1 from public.admins where user_id = p_user)
     or (em <> '' and exists (select 1 from public.admin_emails where lower(email) = em)) then
    raise exception 'admin accounts cannot be deleted from the app' using errcode = 'P0001';
  end if;
  -- events where this person (by email or user id) is the only host
  select coalesce(array_agg(distinct m.event_id), '{}') into ev_ids
    from public.event_members m
   where coalesce((em <> '' and lower(m.email) = em) or m.user_id = p_user, false) and m.role = 'host'
     and not exists (
       select 1 from public.event_members o
        where o.event_id = m.event_id and o.role = 'host'
          and not coalesce((em <> '' and lower(o.email) = em) or o.user_id = p_user, false));
  select count(*) into n_guests from public.guests where event_id = any(ev_ids);
  delete from public.event_members where (em <> '' and lower(email) = em) or user_id = p_user;
  get diagnostics n_members = row_count;
  delete from public.events where id = any(ev_ids);
  if em <> '' then
    update public.checkin_events set by_email = null where lower(by_email) = em;
    update public.attendance_exceptions set requested_by = null where lower(requested_by) = em;
    update public.attendance_exceptions set decided_by = null where lower(decided_by) = em;
    update public.audit_logs set actor = null where lower(actor) = em;
  end if;
  delete from public.profiles where user_id = p_user;
  insert into public.account_deletions (user_id, events_deleted, guests_deleted, memberships_removed)
  values (p_user, coalesce(array_length(ev_ids, 1), 0), n_guests, n_members);
  return json_build_object('event_ids', to_json(ev_ids), 'guests_deleted', n_guests, 'memberships_removed', n_members);
end $$;

-- ---------- 15. Who can call what ----------
-- _v2_norm_phone is a plain text function used by an index on guests, so whoever writes guests runs it
revoke all on function public._v2_norm_phone(text) from public;
grant execute on function public._v2_norm_phone(text) to anon, authenticated;
-- internal helpers: nobody from the app
revoke all on function public._v2_phone(), public._v2_is_me(text, text, uuid),
  public._v2_my_role(uuid), public._v2_need_host(uuid, boolean), public._v2_can_preview(uuid),
  public._v2_apply_event(uuid, jsonb), public._v2_member_json(public.event_members), public._v2_quote(uuid, text, boolean),
  public._v2_order_json(public.orders), public._v2_need_admin(), public._v2_event_host_json(uuid)
  from public, anon, authenticated;
-- server only (checkout-test / send-invites / whatsapp-webhook, with the service key)
revoke all on function public._v2_mark_paid(uuid, text, text), public._v2_mark_failed(uuid, text, text),
  public.invite_send_claim(int), public.invite_send_result(uuid, boolean, text, text),
  public.invite_send_status_update(text, text, text, uuid) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public._v2_mark_paid(uuid, text, text), public._v2_mark_failed(uuid, text, text),
      public.invite_send_claim(int), public.invite_send_result(uuid, boolean, text, text),
      public.invite_send_status_update(text, text, text, uuid) to service_role;
    grant select on public.orders, public.invite_sends to service_role;
  end if;
end $$;
-- signed-in users only (each one checks who is calling)
revoke all on function public.create_event_v2(jsonb), public.update_event_v2(uuid, jsonb), public.my_events_v2(),
  public.list_members_v2(uuid), public.add_member_v2(uuid, text, text, text, text), public.remove_member_v2(uuid),
  public.cohost_guests_v2(uuid), public.quote_v2(uuid, text, boolean), public.start_checkout_v2(uuid, text, boolean, text),
  public.request_change_v2(uuid, text, text, text, text[], text), public.request_design_v2(uuid, text, text, text, text[]),
  public.approve_design_v2(uuid, text), public.event_orders_v2(uuid), public.event_requests_v2(uuid), public.order_status_v2(uuid),
  public.preview_invite_v2(uuid), public.my_invites_v2(), public.my_profile_v2(), public.save_profile_v2(text, text),
  public.invite_send_status_v2(uuid), public.admin_orders_v2(text), public.admin_requests_v2(),
  public.admin_set_request_v2(text, uuid, text, text), public.admin_set_package_v2(uuid, text, boolean),
  public.admin_mark_paid_v2(uuid, text) from public, anon;
grant execute on function public.create_event_v2(jsonb), public.update_event_v2(uuid, jsonb), public.my_events_v2(),
  public.list_members_v2(uuid), public.add_member_v2(uuid, text, text, text, text), public.remove_member_v2(uuid),
  public.cohost_guests_v2(uuid), public.quote_v2(uuid, text, boolean), public.start_checkout_v2(uuid, text, boolean, text),
  public.request_change_v2(uuid, text, text, text, text[], text), public.request_design_v2(uuid, text, text, text, text[]),
  public.approve_design_v2(uuid, text), public.event_orders_v2(uuid), public.event_requests_v2(uuid), public.order_status_v2(uuid),
  public.preview_invite_v2(uuid), public.my_invites_v2(), public.my_profile_v2(), public.save_profile_v2(text, text),
  public.invite_send_status_v2(uuid), public.admin_orders_v2(text), public.admin_requests_v2(),
  public.admin_set_request_v2(text, uuid, text, text), public.admin_set_package_v2(uuid, text, boolean),
  public.admin_mark_paid_v2(uuid, text) to authenticated;
-- replaced functions keep their grants (create or replace never changes them); old grants are not touched here.

commit;
select 'Self-serve added' as result;
