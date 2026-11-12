-- ======================================================================
-- UNDO for 002_mvp_core.sql. Only run this if the upgrade causes a problem.
-- Supabase → SQL Editor → New query → paste → Run.
--
-- The pages switch back to the old behaviour on their own once the *_v2
-- functions are gone. Guest replies are kept. What is LOST: door requests,
-- the check-in log and the activity log (their tables are deleted).
-- The added columns (confirmed_count, checked_in_count, replied_at,
-- rsvp_deadline, allow_changes, public_link_enabled, expires_at) are kept
-- because removing them would lose data; the old pages simply ignore them.
-- ======================================================================
begin;
drop trigger if exists guests_v2_limits on public.guests;
drop function if exists public._v2_guest_limits();
drop function if exists public.get_invite_v2(text);
drop function if exists public.get_event_public_v2(text);
drop function if exists public.respond_v2(text, text, int, text);
drop function if exists public.public_rsvp_v2(text, text, text, text, text);
drop function if exists public.host_set_reply_v2(uuid, text, int);
drop function if exists public.host_set_extras_v2(uuid, int);
drop function if exists public.host_set_rules_v2(uuid, timestamptz, boolean, boolean);
drop function if exists public.list_exceptions_v2(uuid);
drop function if exists public.decide_exception_v2(uuid, boolean);
drop function if exists public.audit_log_v2(uuid);
drop function if exists public.door_list_v2(uuid);
drop function if exists public.check_in_v2(uuid, int);
drop function if exists public.request_exception_v2(uuid, uuid, text, int, text);
drop function if exists public._v2_guest_json(public.guests, public.events);
drop function if exists public._v2_event_json(public.events);
drop function if exists public._v2_log(uuid, text, jsonb);
drop function if exists public._v2_host_side(uuid);
drop function if exists public._v2_role(uuid);
drop function if exists public._v2_email();
drop table if exists public.checkin_events;
drop table if exists public.attendance_exceptions;
drop table if exists public.audit_logs;
alter table public.guests drop constraint if exists guests_confirmed_in_range;
alter table public.guests drop constraint if exists guests_checked_in_nonneg;
commit;
select 'Undo finished' as result;
