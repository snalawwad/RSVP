-- ======================================================================
-- RSVP: door Undo (optional, additive)
--
-- HOW TO RUN: Supabase → SQL Editor → New query → paste this whole file → Run.
-- Run it only after 002_mvp_core.sql.
--
-- WHAT IT DOES
--  * Adds ONE new function, public.undo_check_in_v2(guest, people).
--  * Changes no table, no column and no existing function.
--  * The door page works without it: it just hides its Undo button and asks
--    staff to tell the host instead.
--
-- THE RULES
--  * Only someone who can check guests in at that event can call it
--    (door, host, admin), with the same list limits as check_in_v2.
--  * It only reverses a check-in made by the SAME email, within the last
--    10 minutes, for exactly that number of people (the latest such entry).
--    Host-approved door requests are never undone here.
--  * The arrival count never goes below 0. When it reaches 0 the guest is
--    no longer marked as arrived.
--  * The check-in entry is removed (so a second Undo finds nothing) and the
--    undo is written to the activity log as 'undo_check_in'.
--
-- TO REMOVE IT AGAIN:
--   drop function if exists public.undo_check_in_v2(uuid, int);
-- ======================================================================
begin;

do $$
begin
  if to_regclass('public.checkin_events') is null
     or not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = 'check_in_v2') then
    raise exception 'Stopped, nothing changed. Run 002_mvp_core.sql first.';
  end if;
end $$;

create or replace function public.undo_check_in_v2(p_guest uuid, p_people int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.guests; c public.checkin_events; me text := public._v2_email(); allowed int; n int;
begin
  select * into g from public.guests where id = p_guest for update;   -- one door at a time per guest
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if public._v2_role(g.event_id) is null or me = '' then raise exception 'Not allowed'; end if;
  if public._v2_host_side(g.event_id) is not null and g.side is distinct from public._v2_host_side(g.event_id) then raise exception 'Not allowed'; end if;
  if p_people is null or p_people < 1 then raise exception 'Enter how many people to undo'; end if;

  -- the latest check-in of exactly this many people by this email (not a host-approved request)
  select ce.* into c from public.checkin_events ce
   where ce.guest_id = g.id and ce.event_id = g.event_id and ce.people = p_people
     and lower(coalesce(ce.by_email, '')) = me
     and not exists (select 1 from public.attendance_exceptions x
                      where x.guest_id = ce.guest_id and x.status = 'approved'
                        and x.people = ce.people and x.decided_at = ce.created_at)
   order by ce.created_at desc
   limit 1
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason',
      case when exists (select 1 from public.checkin_events ce where ce.guest_id = g.id
                         and lower(coalesce(ce.by_email, '')) <> me) then 'not_yours' else 'nothing' end,
      'name', g.name);
  end if;
  if c.created_at < now() - interval '10 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'too_late', 'name', g.name);
  end if;

  n := greatest(0, coalesce(g.checked_in_count, 0) - c.people);
  update public.guests set checked_in_count = n, checked_in_at = case when n = 0 then null else checked_in_at end
   where id = g.id returning * into g;
  delete from public.checkin_events where id = c.id;
  perform public._v2_log(g.event_id, 'undo_check_in',
    jsonb_build_object('guest', g.id, 'people', c.people, 'checked_in', c.created_at));
  allowed := case g.status when 'yes' then coalesce(g.confirmed_count, g.seats) when 'pending' then g.seats else 0 end;
  return jsonb_build_object('ok', true, 'name', g.name, 'people', c.people, 'arrived', g.checked_in_count,
                            'left', greatest(0, allowed - g.checked_in_count), 'status', g.status);
end $$;

-- logged-in staff only (Supabase gives new functions to everyone by default)
revoke all on function public.undo_check_in_v2(uuid, int) from public, anon;
grant execute on function public.undo_check_in_v2(uuid, int) to authenticated;

commit;
select 'Door undo added' as result;
