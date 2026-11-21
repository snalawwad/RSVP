-- 0009: a host (or an admin) can delete an event.
-- Deleting removes the event with its guests, replies, check-ins, team and requests (they cascade).
-- Orders also cascade, so first a copy of the event and its orders goes into deleted_events: the money record
-- stays for the books and refunds. Only the main host (not a co-host, a family-side host or door staff) or an admin.
begin;

create table if not exists public.deleted_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  title text,
  status text,
  starts_at timestamptz,
  guests int,
  paid_fils int not null default 0,
  deleted_by uuid,
  deleted_by_email text,
  deleted_at timestamptz not null default now(),
  snapshot jsonb not null
);
alter table public.deleted_events enable row level security;
revoke all on public.deleted_events from public, anon, authenticated;

create or replace function public.delete_event_v2(p_event uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.events; n int; paid int;
begin
  perform public._v2_need_host(p_event, true);   -- main host or admin (a family-side host can't)
  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select count(*) into n from public.guests where event_id = p_event;
  select coalesce(sum(amount_fils) filter (where status = 'paid'), 0) into paid from public.orders where event_id = p_event;
  insert into public.deleted_events(event_id, title, status, starts_at, guests, paid_fils, deleted_by, deleted_by_email, snapshot)
  values (e.id, e.title, e.status, e.starts_at, n, paid, auth.uid(), nullif(public._v2_email(), ''),
          jsonb_build_object('event', to_jsonb(e),
            'orders', coalesce((select jsonb_agg(to_jsonb(o)) from public.orders o where o.event_id = p_event), '[]'::jsonb),
            'requests', coalesce((select jsonb_agg(to_jsonb(r)) from public.event_requests r where r.event_id = p_event), '[]'::jsonb)));
  delete from public.events where id = p_event;
  return jsonb_build_object('ok', true, 'guests', n, 'paid_fils', paid);
end $$;

revoke all on function public.delete_event_v2(uuid) from public, anon;
grant execute on function public.delete_event_v2(uuid) to authenticated;

commit;
select 'Delete event added' as result;
