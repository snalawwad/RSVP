-- 0001 account deletion (App Store and Google Play require it).
-- ADD-ONLY: one new table, two new functions. Nothing existing is changed or removed,
-- so the live guest page, host page, admin and door keep working exactly as before.
--
-- How deletion works:
--   1. The app calls my_account_summary() to show the host what will be removed.
--   2. The host confirms; the app calls the delete-account Edge Function.
--   3. The function (server side, with the service key Supabase gives it) calls
--      delete_account_data(), removes those events' card images, then deletes the login.
--
-- What gets deleted for a host:
--   * every event_members row with their email (host or door access)
--   * every event where they were the ONLY host, with its guests (guests cascade)
-- Events that have another host stay; only this person's access goes.
-- Admin accounts (Sara and Sama) can never be deleted this way.

-- A record that a deletion happened, with no personal details (no email, no names).
create table if not exists public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  events_deleted integer not null default 0,
  guests_deleted integer not null default 0,
  memberships_removed integer not null default 0,
  deleted_at timestamptz not null default now()
);

alter table public.account_deletions enable row level security;

drop policy if exists account_deletions_admin_read on public.account_deletions;
create policy account_deletions_admin_read on public.account_deletions
  for select to authenticated using (public.is_admin());

-- What deleting my account would remove. Safe to call any time; changes nothing.
create or replace function public.my_account_summary()
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
  with me as (select public.current_email() as email),
  mine as (
    select m.event_id, m.role
      from public.event_members m, me
     where lower(m.email) = me.email and me.email <> ''
  ),
  solo as (
    select e.id, e.title, e.starts_at,
           (select count(*) from public.guests g where g.event_id = e.id) as guests
      from public.events e
      join mine on mine.event_id = e.id and mine.role = 'host'
     where not exists (
       select 1 from public.event_members o, me
        where o.event_id = e.id and o.role = 'host' and lower(o.email) <> me.email)
  )
  select json_build_object(
    'email', (select email from me),
    'is_admin', public.is_admin(),
    'memberships', (select count(*) from mine),
    'events_to_delete', coalesce((select json_agg(json_build_object(
        'id', id, 'title', title, 'starts_at', starts_at, 'guests', guests) order by starts_at) from solo), '[]'::json)
  )
$$;

revoke all on function public.my_account_summary() from public, anon;
grant execute on function public.my_account_summary() to authenticated;

-- Removes a person's data. Only the server (service_role) may run it, never the app directly.
create or replace function public.delete_account_data(p_user uuid, p_email text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  em text := lower(trim(coalesce(p_email, '')));
  ev_ids uuid[];
  n_guests integer := 0;
  n_members integer := 0;
begin
  if p_user is null then
    raise exception 'user required';
  end if;
  if exists (select 1 from public.admins where user_id = p_user)
     or (em <> '' and exists (select 1 from public.admin_emails where lower(email) = em)) then
    raise exception 'admin accounts cannot be deleted from the app' using errcode = 'P0001';
  end if;

  if em <> '' then
    -- events where this person is the only host
    select coalesce(array_agg(m.event_id), '{}') into ev_ids
      from public.event_members m
     where lower(m.email) = em and m.role = 'host'
       and not exists (
         select 1 from public.event_members o
          where o.event_id = m.event_id and o.role = 'host' and lower(o.email) <> em);

    select count(*) into n_guests from public.guests where event_id = any(ev_ids);

    delete from public.event_members where lower(email) = em;
    get diagnostics n_members = row_count;

    delete from public.events where id = any(ev_ids);  -- guests and members cascade
  else
    ev_ids := '{}';
  end if;

  insert into public.account_deletions (user_id, events_deleted, guests_deleted, memberships_removed)
  values (p_user, coalesce(array_length(ev_ids, 1), 0), n_guests, n_members);

  return json_build_object('event_ids', to_json(ev_ids), 'guests_deleted', n_guests,
                           'memberships_removed', n_members);
end $$;

revoke all on function public.delete_account_data(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid, text) to service_role;
