-- 0008: "Create an event" in the iPhone app sends a request instead of paying in the app.
-- The host fills in the details; this makes the event as a draft (same as the website) and saves a
-- request the team sees in the back office (Requests). The team finishes it with the host, payment included.
-- Additive only: one table, one new function, and three existing functions extended with the new kind.
begin;

create table if not exists public.event_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guests int check (guests is null or guests between 1 and 5000),
  door boolean not null default false,
  design text check (design is null or design in ('we_design', 'own', 'simple')),
  contact text check (contact is null or length(contact) <= 40),
  notes text check (notes is null or length(notes) <= 2000),
  status text not null default 'requested' check (status in ('requested', 'in_progress', 'done', 'cancelled')),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists event_requests_event_idx on public.event_requests(event_id, created_at desc);
alter table public.event_requests enable row level security;
revoke all on public.event_requests from public, anon, authenticated;

-- Any signed-in user. p = { event: {title, event_type, starts_at, venue, lang, ...}, guests, door, design, contact, notes }
create or replace function public.request_event_v2(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare id uuid; g int; d text;
begin
  if auth.uid() is null then raise exception 'Not allowed'; end if;
  if nullif(trim(coalesce(p->'event'->>'title', '')), '') is null then raise exception 'NEED_TITLE'; end if;
  if (select count(*) from public.event_requests where created_by = auth.uid() and status = 'requested') >= 10 then raise exception 'TOO_MANY_REQUESTS'; end if;
  g := case when coalesce(p->>'guests', '') ~ '^\d{1,4}$' then (p->>'guests')::int end;
  d := case when p->>'design' in ('we_design', 'own', 'simple') then p->>'design' end;
  id := public.create_event_v2(coalesce(p->'event', '{}'::jsonb));
  insert into public.event_requests(event_id, guests, door, design, contact, notes, created_by)
  values (id, case when g between 1 and 5000 then g end, coalesce((p->>'door')::boolean, false), d,
          left(nullif(trim(coalesce(p->>'contact', '')), ''), 40), left(nullif(trim(coalesce(p->>'notes', '')), ''), 2000), auth.uid());
  perform public._v2_log(id, 'request_event', jsonb_build_object('guests', g, 'door', coalesce((p->>'door')::boolean, false), 'design', d));
  return id;
end $$;

-- the host's own requests on an event: + kind 'event'
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
        from public.design_requests d where d.event_id = p_event
      union all
      select r.created_at, jsonb_build_object('kind', 'event', 'id', r.id, 'event_id', r.event_id, 'guests', r.guests, 'door', r.door,
        'design', r.design, 'contact', r.contact, 'notes', r.notes, 'status', r.status, 'created_at', r.created_at)
        from public.event_requests r where r.event_id = p_event) x), '[]'::jsonb);
end $$;

-- back office list: + kind 'event' (with the event's when/where so the team can call the host ready)
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
        from public.design_requests d join public.events e on e.id = d.event_id
      union all
      select r.created_at, jsonb_build_object('kind', 'event', 'id', r.id, 'event_id', r.event_id, 'event_title', e.title,
        'host', public._v2_event_host_json(e.id), 'event_type', e.event_type, 'starts_at', e.starts_at, 'venue', e.venue, 'lang', e.lang,
        'guests', r.guests, 'door', r.door, 'design', r.design, 'contact', r.contact, 'notes', r.notes,
        'status', r.status, 'created_at', r.created_at)
        from public.event_requests r join public.events e on e.id = r.event_id) x), '[]'::jsonb);
end $$;

create or replace function public.admin_set_request_v2(p_kind text, p_id uuid, p_status text, p_draft_url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.change_requests; d public.design_requests; r public.event_requests;
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
  elsif p_kind = 'event' then
    if p_status not in ('requested', 'in_progress', 'done', 'cancelled') then raise exception 'BAD_STATUS'; end if;
    update public.event_requests set status = p_status where id = p_id returning * into r;
    if not found then raise exception 'NOT_FOUND'; end if;
    perform public._v2_log(r.event_id, 'admin_set_request', jsonb_build_object('kind', 'event', 'request', r.id, 'status', p_status));
    return to_jsonb(r);
  end if;
  raise exception 'BAD_KIND';
end $$;

revoke all on function public.request_event_v2(jsonb) from public, anon;
grant execute on function public.request_event_v2(jsonb) to authenticated;

commit;
select 'Event requests added' as result;
