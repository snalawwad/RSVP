-- 0010: the last pieces of Sama's 22 Nov frames (Sara, 24 Nov: "build all of them").
-- Additive only. Nothing is dropped or renamed; existing calls keep their answers and gain extra keys.
--   1. guests.note        24l "Note (optional)", e.g. "Bride's mum". Only the event's hosts read it (the guests table
--                         is host-only; co-hosts, door staff and guests get named columns that leave it out).
--   2. change drafts      24p for paid invitation changes: the team sends a draft (draft_sent + draft_url), the host
--                         approves it (approve_change_v2, already paid, so no charge), the team makes it live (done).
--   3. profiles.notify    24b "Notifications": on or off, saved on the account so the app and the website agree.
--   4. my_events_v2       + "with": the names of the others hosting the event (24g "With Dana S").
--      my_invites_v2      + the event's invite line and reply-by date (24g "From the Al Sabah family", "Reply by 20 Dec").
-- Undo: the new columns can stay (nothing reads them without this file's functions); to remove them,
--   alter table public.guests drop column note; alter table public.change_requests drop column draft_url;
--   alter table public.profiles drop column notify; drop function public.approve_change_v2(uuid);
--   drop function public.set_notify_v2(boolean); and re-run the 0007/0008 bodies of the functions below.
begin;

-- ---------- 1. a note on a guest ----------
alter table public.guests add column if not exists note text;
alter table public.guests drop constraint if exists guests_note_len;
alter table public.guests add constraint guests_note_len check (note is null or length(note) <= 200);

-- ---------- 2. a draft for a paid change, approved by the host ----------
alter table public.change_requests add column if not exists draft_url text;
alter table public.change_requests drop constraint if exists change_requests_draft_url_len;
alter table public.change_requests add constraint change_requests_draft_url_len check (draft_url is null or length(draft_url) <= 500);
alter table public.change_requests drop constraint if exists change_requests_status_check;
alter table public.change_requests add constraint change_requests_status_check
  check (status in ('awaiting_payment', 'requested', 'in_progress', 'draft_sent', 'approved', 'done', 'cancelled'));

-- The host says yes to the team's draft. The change was paid for when it was asked for, so nothing is charged.
create or replace function public.approve_change_v2(p_request uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.change_requests;
begin
  select * into c from public.change_requests where id = p_request for update;
  if not found then raise exception 'Not allowed'; end if;
  perform public._v2_need_host(c.event_id, true);
  if c.status in ('approved', 'done') then return jsonb_build_object('id', c.id, 'status', c.status, 'already', true); end if;
  if c.status <> 'draft_sent' then raise exception 'NO_DRAFT_YET'; end if;
  update public.change_requests set status = 'approved' where id = c.id returning * into c;
  perform public._v2_log(c.event_id, 'approve_change', jsonb_build_object('request', c.id));
  return jsonb_build_object('id', c.id, 'status', c.status, 'already', false);
end $$;
revoke all on function public.approve_change_v2(uuid) from public, anon;
grant execute on function public.approve_change_v2(uuid) to authenticated;

-- the host's own requests: change requests now carry their draft link (0008 body + 'draft_url' on changes)
create or replace function public.event_requests_v2(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._v2_need_host(p_event);
  return coalesce((select jsonb_agg(x.j order by x.at desc) from (
      select c.created_at at, jsonb_build_object('kind', 'change', 'id', c.id, 'event_id', c.event_id, 'what', c.what, 'wording', c.wording,
        'colours', c.colours, 'photos', to_jsonb(c.photos), 'status', c.status, 'draft_url', c.draft_url, 'order_id', c.order_id,
        'created_at', c.created_at, 'done_at', c.done_at) j
        from public.change_requests c where c.event_id = p_event
      union all
      select d.created_at, jsonb_build_object('kind', 'design', 'id', d.id, 'event_id', d.event_id, 'idea', d.idea, 'wording', d.wording,
        'colours', d.colours, 'photos', to_jsonb(d.photos), 'status', d.status, 'draft_url', d.draft_url, 'order_id', d.order_id, 'created_at', d.created_at)
        from public.design_requests d where d.event_id = p_event
      union all
      select r.created_at, jsonb_build_object('kind', 'event', 'id', r.id, 'event_id', r.event_id, 'guests', r.guests, 'door', r.door,
        'design', r.design, 'contact', r.contact, 'notes', r.notes, 'status', r.status, 'created_at', r.created_at)
        from public.event_requests r where r.event_id = p_event) x), '[]'::jsonb);
end $$;

-- back office list (0008 body + 'draft_url' on changes)
create or replace function public.admin_requests_v2() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._v2_need_admin();
  return coalesce((select jsonb_agg(x.j order by x.at desc) from (
      select c.created_at at, jsonb_build_object('kind', 'change', 'id', c.id, 'event_id', c.event_id, 'event_title', e.title,
        'host', public._v2_event_host_json(e.id), 'what', c.what, 'wording', c.wording, 'colours', c.colours, 'photos', to_jsonb(c.photos),
        'status', c.status, 'draft_url', c.draft_url, 'order_id', c.order_id, 'created_at', c.created_at, 'done_at', c.done_at) j
        from public.change_requests c join public.events e on e.id = c.event_id
      union all
      select d.created_at, jsonb_build_object('kind', 'design', 'id', d.id, 'event_id', d.event_id, 'event_title', e.title,
        'host', public._v2_event_host_json(e.id), 'idea', d.idea, 'wording', d.wording, 'colours', d.colours, 'photos', to_jsonb(d.photos),
        'status', d.status, 'draft_url', d.draft_url, 'order_id', d.order_id, 'created_at', d.created_at)
        from public.design_requests d join public.events e on e.id = d.event_id
      union all
      select r.created_at, jsonb_build_object('kind', 'event', 'id', r.id, 'event_id', r.event_id, 'event_title', e.title,
        'host', public._v2_event_host_json(e.id), 'event_type', e.event_type, 'starts_at', e.starts_at, 'venue', e.venue, 'lang', e.lang,
        'guests', r.guests, 'door', r.door, 'design', r.design, 'contact', r.contact, 'notes', r.notes,
        'status', r.status, 'created_at', r.created_at)
        from public.event_requests r join public.events e on e.id = r.event_id) x), '[]'::jsonb);
end $$;

-- back office: a change can now be "Draft sent" (with its link) and "Approved" (0008 body, change branch widened)
create or replace function public.admin_set_request_v2(p_kind text, p_id uuid, p_status text, p_draft_url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.change_requests; d public.design_requests; r public.event_requests;
begin
  perform public._v2_need_admin();
  if p_kind = 'change' then
    if p_status not in ('awaiting_payment', 'requested', 'in_progress', 'draft_sent', 'approved', 'done', 'cancelled') then raise exception 'BAD_STATUS'; end if;
    update public.change_requests set status = p_status, done_at = case when p_status = 'done' then now() else null end,
      draft_url = coalesce(left(nullif(trim(coalesce(p_draft_url, '')), ''), 500), draft_url)
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
  elsif p_kind = 'event' then
    if p_status not in ('requested', 'in_progress', 'done', 'cancelled') then raise exception 'BAD_STATUS'; end if;
    update public.event_requests set status = p_status where id = p_id returning * into r;
    if not found then raise exception 'NOT_FOUND'; end if;
    perform public._v2_log(r.event_id, 'admin_set_request', jsonb_build_object('kind', 'event', 'request', r.id, 'status', p_status));
    return to_jsonb(r);
  end if;
  raise exception 'BAD_KIND';
end $$;

-- ---------- 3. notifications on or off ----------
alter table public.profiles add column if not exists notify boolean not null default true;

-- 0007 body + 'notify'
create or replace function public.my_profile_v2() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pr public.profiles;
begin
  if auth.uid() is null then raise exception 'Not allowed'; end if;
  select * into pr from public.profiles where user_id = auth.uid();
  return jsonb_build_object('user_id', auth.uid(), 'name', pr.name,
    'phone', coalesce(nullif(public._v2_phone(), ''), pr.phone),
    'email', coalesce(nullif(public._v2_email(), ''), pr.email),
    'is_admin', public.is_admin(),
    'notify', coalesce(pr.notify, true));
end $$;

create or replace function public.set_notify_v2(p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not allowed'; end if;
  insert into public.profiles(user_id, phone, email, notify)
  values (auth.uid(), nullif(public._v2_phone(), ''), nullif(public._v2_email(), ''), coalesce(p_on, true))
  on conflict (user_id) do update set notify = coalesce(p_on, true);
  return public.my_profile_v2();
end $$;
revoke all on function public.set_notify_v2(boolean) from public, anon;
grant execute on function public.set_notify_v2(boolean) to authenticated;

-- ---------- 4. "With …" and "From …" on Home ----------
-- 0007 body + 'with': the names of the event's other hosts and co-hosts (never phone numbers or emails)
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
           (select pk.door_included from public.packages pk where pk.code = e.package) as pk_door,
           (select coalesce(jsonb_agg(x.nm order by x.ord, x.at), '[]'::jsonb) from (
              select coalesce(nullif(trim(m2.name), ''), nullif(trim(p2.name), '')) nm, case m2.role when 'host' then 0 else 1 end ord, m2.created_at at
                from public.event_members m2 left join public.profiles p2 on p2.user_id = m2.user_id
               where m2.event_id = e.id and m2.role in ('host', 'cohost') and not public._v2_is_me(m2.email, m2.phone, m2.user_id)) x
             where x.nm is not null) as with_
      from mine join public.events e on e.id = mine.event_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'title', r.title, 'event_type', r.event_type, 'starts_at', r.starts_at, 'ends_at', r.ends_at,
      'venue', r.venue, 'card_image_url', r.card_image_url, 'lang', r.lang, 'public_code', r.public_code,
      'role', r.my_role, 'status', r.status, 'package', r.package, 'door_addon', r.door_addon,
      'door', coalesce(r.pk_door, false) or r.door_addon, 'send_channel', r.send_channel,
      'invite_limit', r.invite_limit, 'paid_at', r.paid_at, 'counts', r.counts,
      'with', case when r.my_role = 'door' then '[]'::jsonb else r.with_ end)
      order by (r.starts_at is not null and r.starts_at < now() - interval '1 day'),
               case when r.starts_at is null or r.starts_at >= now() - interval '1 day' then r.starts_at end asc nulls first,
               r.starts_at desc), '[]'::jsonb)
    into res from rows_ r;
  return res;
end $$;

-- 0007 body + the event's 'invite_line' and 'reply_by' (both already on the guest's own invite page)
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
               'venue', e.venue, 'map_url', e.map_url, 'card_image_url', e.card_image_url, 'lang', e.lang,
               'invite_line', e.invite_line, 'reply_by', e.rsvp_deadline)) j
      from public.guests g join public.events e on e.id = g.event_id
     where g.phone is not null and public._v2_norm_phone(g.phone) = ph and e.status in ('active', 'done')) x), '[]'::jsonb);
end $$;

commit;
select 'Figma finish added' as result;
