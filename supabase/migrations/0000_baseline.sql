-- 0000 baseline: the live database structure, exported read-only on 12 Nov 2026 (no guest data).
-- It records what already exists on the live project (hexnxpufurftldpfcukd).
-- NEVER run this on the live project. Run it only on a new, empty test project,
-- then run the numbered files after it in order. Every later change is a new file that only adds.
--
-- Not captured by the export (set up by Supabase itself or in the dashboard):
--   * the rls_auto_enable event trigger (turns on row-level security for new tables)
--   * Auth settings: email login with code, Site URL and redirect URLs
--   * the Magic Link email template line "Your code: {{ .Token }}"

-- Functions call each other, so skip body checks while creating them in alphabetical order.
set check_function_bodies = off;


-- ===== Tables =====

create table if not exists public.admin_emails (
  email text not null
);

create table if not exists public.admins (
  user_id uuid not null,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.event_members (
  id uuid not null default gen_random_uuid(),
  event_id uuid not null,
  email text not null,
  role text not null default 'host'::text,
  side text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.events (
  id uuid not null default gen_random_uuid(),
  title text not null,
  event_type text not null default 'wedding'::text,
  invite_line text,
  headline text,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  venue text,
  map_url text,
  message_template text,
  theme_accent text not null default '#65060B'::text,
  theme_paper text not null default '#FFFBFA'::text,
  card_image_url text,
  lang text not null default 'ar'::text,
  invite_limit integer,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  public_code text default encode(gen_random_bytes(6), 'hex'::text),
  map_spot text,
  note text
);

create table if not exists public.guests (
  id uuid not null default gen_random_uuid(),
  event_id uuid not null,
  name text not null,
  phone text,
  seats integer not null default 1,
  side text,
  token text not null default encode(gen_random_bytes(18), 'hex'::text),
  status text not null default 'pending'::text,
  decline_reason text,
  responded_at timestamp with time zone,
  sent_at timestamp with time zone,
  checked_in_at timestamp with time zone,
  checked_in_count integer,
  created_at timestamp with time zone not null default now(),
  source text not null default 'list'::text
);


-- ===== Constraints =====

alter table public.admin_emails add constraint admin_emails_pkey PRIMARY KEY (email);

alter table public.admins add constraint admins_pkey PRIMARY KEY (user_id);

alter table public.event_members add constraint event_members_pkey PRIMARY KEY (id);

alter table public.events add constraint events_pkey PRIMARY KEY (id);

alter table public.guests add constraint guests_pkey PRIMARY KEY (id);

alter table public.event_members add constraint event_members_event_id_email_key UNIQUE (event_id, email);

alter table public.guests add constraint guests_token_key UNIQUE (token);

alter table public.guests add constraint guests_event_id_phone_key UNIQUE (event_id, phone);

alter table public.event_members add constraint event_members_role_check CHECK ((role = ANY (ARRAY['host'::text, 'door'::text])));

alter table public.events add constraint events_lang_check CHECK ((lang = ANY (ARRAY['ar'::text, 'en'::text])));

alter table public.events add constraint events_invite_limit_check CHECK (((invite_limit IS NULL) OR (invite_limit >= 0)));

alter table public.guests add constraint guests_seats_check CHECK ((seats >= 1));

alter table public.guests add constraint guests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'yes'::text, 'no'::text])));

alter table public.admins add constraint admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.event_members add constraint event_members_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

alter table public.events add constraint events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.guests add constraint guests_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

-- ===== Indexes =====

CREATE INDEX members_email_idx ON public.event_members USING btree (lower(email));

CREATE UNIQUE INDEX events_public_code_idx ON public.events USING btree (public_code);

CREATE INDEX guests_event_idx ON public.guests USING btree (event_id);


-- ===== Functions =====

CREATE OR REPLACE FUNCTION public.can_door(p_event uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(public.is_admin() or public.event_role(p_event) in ('host', 'door'), false)
$function$
;

CREATE OR REPLACE FUNCTION public.can_host(p_event uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(public.is_admin() or public.event_role(p_event) = 'host', false)
$function$
;

CREATE OR REPLACE FUNCTION public.can_upload_card(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare eid uuid;
begin
  begin
    eid := split_part(p_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return public.can_host(eid);
end $function$
;

CREATE OR REPLACE FUNCTION public.check_in(p_token text, p_event uuid, p_count integer DEFAULT NULL::integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare g public.guests;
begin
  if not public.can_door(p_event) then
    raise exception 'not allowed';
  end if;
  select * into g from public.guests where token = p_token and event_id = p_event;
  if g.id is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  if g.checked_in_at is not null then
    return json_build_object('ok', true, 'already', true, 'name', g.name, 'seats', g.seats,
                             'status', g.status, 'checked_in_at', g.checked_in_at);
  end if;
  update public.guests
     set checked_in_at = now(), checked_in_count = coalesce(p_count, g.seats)
   where id = g.id
  returning * into g;
  return json_build_object('ok', true, 'already', false, 'name', g.name, 'seats', g.seats,
                           'status', g.status, 'checked_in_at', g.checked_in_at);
end $function$
;

CREATE OR REPLACE FUNCTION public.check_in_guest(p_guest uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare g public.guests;
begin
  select * into g from public.guests where id = p_guest;
  if g.id is null or not public.can_door(g.event_id) then
    raise exception 'not allowed';
  end if;
  return public.check_in(g.token, g.event_id, null);
end $function$
;

CREATE OR REPLACE FUNCTION public.current_email()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$function$
;

CREATE OR REPLACE FUNCTION public.door_list(p_event uuid)
 RETURNS TABLE(id uuid, name text, seats integer, status text, checked_in_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_door(p_event) then
    raise exception 'not allowed';
  end if;
  return query
    select g.id, g.name, g.seats, g.status, g.checked_in_at
      from public.guests g where g.event_id = p_event order by g.name;
end $function$
;

CREATE OR REPLACE FUNCTION public.enforce_invite_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare lim int; used int;
begin
  select invite_limit into lim from public.events where id = new.event_id;
  if lim is null then return new; end if;
  select coalesce(sum(seats), 0) into used from public.guests
   where event_id = new.event_id and id is distinct from new.id;
  if used + new.seats > lim then
    raise exception 'invite limit reached: % of % used', used, lim using errcode = 'P0001';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.event_role(p_event uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role from public.event_members
  where event_id = p_event and lower(email) = public.current_email()
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.get_event_public(p_code text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select json_build_object(
    'title', e.title, 'event_type', e.event_type, 'lang', e.lang, 'invite_line', e.invite_line,
    'headline', e.headline, 'note', e.note, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'venue', e.venue, 'map_url', e.map_url, 'map_spot', e.map_spot, 'theme_accent', e.theme_accent,
    'theme_paper', e.theme_paper, 'card_image_url', e.card_image_url)
  from public.events e
  where e.public_code = p_code and length(p_code) >= 8
$function$
;

CREATE OR REPLACE FUNCTION public.get_invite(p_token text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select json_build_object(
    'name', g.name, 'seats', g.seats, 'status', g.status,
    'decline_reason', g.decline_reason, 'token', g.token,
    'event', json_build_object(
      'title', e.title, 'event_type', e.event_type, 'lang', e.lang, 'invite_line', e.invite_line,
      'headline', e.headline, 'note', e.note, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
      'venue', e.venue, 'map_url', e.map_url, 'map_spot', e.map_spot, 'theme_accent', e.theme_accent,
      'theme_paper', e.theme_paper, 'card_image_url', e.card_image_url))
  from public.guests g join public.events e on e.id = g.event_id
  where g.token = p_token and length(p_token) >= 24
$function$
;

CREATE OR REPLACE FUNCTION public.host_update_event(p_event uuid, p jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e public.events;
begin
  if not public.can_host(p_event) then raise exception 'not allowed'; end if;
  update public.events set
    title            = case when p ? 'title' and nullif(trim(p->>'title'), '') is not null then left(trim(p->>'title'), 120) else title end,
    invite_line      = case when p ? 'invite_line' then left(nullif(trim(p->>'invite_line'), ''), 300) else invite_line end,
    headline         = case when p ? 'headline' then left(nullif(trim(p->>'headline'), ''), 120) else headline end,
    note             = case when p ? 'note' then left(nullif(trim(p->>'note'), ''), 400) else note end,
    venue            = case when p ? 'venue' then left(nullif(trim(p->>'venue'), ''), 200) else venue end,
    map_url          = case when p ? 'map_url' then left(nullif(trim(p->>'map_url'), ''), 500) else map_url end,
    message_template = case when p ? 'message_template' then left(nullif(p->>'message_template', ''), 2000) else message_template end,
    starts_at        = case when p ? 'starts_at' then nullif(p->>'starts_at', '')::timestamptz else starts_at end,
    ends_at          = case when p ? 'ends_at' then nullif(p->>'ends_at', '')::timestamptz else ends_at end,
    lang             = case when p->>'lang' in ('ar', 'en') then p->>'lang' else lang end,
    card_image_url   = case when p ? 'card_image_url' then left(nullif(p->>'card_image_url', ''), 500) else card_image_url end,
    theme_accent     = case when coalesce(p->>'theme_accent', '') ~ '^#[0-9a-fA-F]{6}$' then p->>'theme_accent' else theme_accent end,
    theme_paper      = case when coalesce(p->>'theme_paper', '') ~ '^#[0-9a-fA-F]{6}$' then p->>'theme_paper' else theme_paper end
  where id = p_event
  returning * into e;
  return row_to_json(e);
end $function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.admins where user_id = auth.uid())
      or (public.current_email() <> '' and exists (select 1 from public.admin_emails where lower(email) = public.current_email()))
$function$
;

CREATE OR REPLACE FUNCTION public.member_side(p_event uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when public.is_admin() then null else (
    select nullif(trim(side), '') from public.event_members
    where event_id = p_event and lower(email) = public.current_email() and role = 'host'
    limit 1) end
$function$
;

CREATE OR REPLACE FUNCTION public.public_rsvp(p_code text, p_name text, p_status text, p_reason text DEFAULT NULL::text, p_token text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e public.events; g public.guests; nm text := left(trim(coalesce(p_name, '')), 80);
begin
  select * into e from public.events where public_code = p_code and length(p_code) >= 8;
  if e.id is null then raise exception 'event not found'; end if;
  if length(nm) < 2 then raise exception 'name required'; end if;
  if p_status not in ('yes', 'no') then raise exception 'invalid status'; end if;
  if p_token is not null then
    select * into g from public.guests where token = p_token and event_id = e.id;
  end if;
  if g.id is null then
    select * into g from public.guests
     where event_id = e.id and source = 'link' and lower(name) = lower(nm) limit 1;
  end if;
  if g.id is null then
    insert into public.guests (event_id, name, phone, seats, status, decline_reason, responded_at, source)
    values (e.id, nm, null, 1, p_status,
            case when p_status = 'no' then left(nullif(trim(p_reason), ''), 500) end, now(), 'link')
    returning * into g;
  else
    update public.guests
       set name = nm, status = p_status, responded_at = now(),
           decline_reason = case when p_status = 'no' then left(nullif(trim(p_reason), ''), 500) end
     where id = g.id
    returning * into g;
  end if;
  return public.get_invite(g.token);
end $function$
;

CREATE OR REPLACE FUNCTION public.respond(p_token text, p_status text, p_reason text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare g public.guests;
begin
  if p_status not in ('yes', 'no', 'pending') then
    raise exception 'invalid status';
  end if;
  update public.guests
     set status = p_status,
         decline_reason = case when p_status = 'no' then left(nullif(trim(p_reason), ''), 500) else null end,
         responded_at = case when p_status = 'pending' then null else now() end
   where token = p_token and length(p_token) >= 24
  returning * into g;
  if g.id is null then
    raise exception 'invite not found';
  end if;
  return public.get_invite(p_token);
end $function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;


-- ===== Triggers =====

CREATE TRIGGER guests_invite_limit BEFORE INSERT OR UPDATE OF seats, event_id ON public.guests FOR EACH ROW EXECUTE FUNCTION enforce_invite_limit();


-- ===== Row-level security =====

alter table public.admin_emails enable row level security;

alter table public.admins enable row level security;

alter table public.event_members enable row level security;

alter table public.events enable row level security;

alter table public.guests enable row level security;


-- ===== Policies =====

create policy admins_self on public.admins as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));

create policy members_read on public.event_members as PERMISSIVE for SELECT to authenticated using ((is_admin() OR (lower(email) = current_email())));

create policy members_admin_write on public.event_members as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());

create policy events_read on public.events as PERMISSIVE for SELECT to authenticated using (can_door(id));

create policy events_admin_write on public.events as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());

create policy guests_host_all on public.guests as PERMISSIVE for ALL to authenticated using ((can_host(event_id) AND ((member_side(event_id) IS NULL) OR (side = member_side(event_id))))) with check ((can_host(event_id) AND ((member_side(event_id) IS NULL) OR (side = member_side(event_id)))));

create policy cards_admin_delete on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'cards'::text) AND is_admin()));

create policy cards_admin_insert on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'cards'::text) AND is_admin()));

create policy cards_admin_update on storage.objects as PERMISSIVE for UPDATE to authenticated using (((bucket_id = 'cards'::text) AND is_admin()));

create policy cards_host_insert on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'cards'::text) AND can_upload_card(name)));


-- ===== Function grants =====

grant execute on function public.can_door to anon, authenticated;

grant execute on function public.can_host to anon, authenticated;

grant execute on function public.can_upload_card to anon, authenticated;

grant execute on function public.check_in to anon, authenticated;

grant execute on function public.check_in_guest to anon, authenticated;

grant execute on function public.current_email to anon, authenticated;

grant execute on function public.door_list to anon, authenticated;

grant execute on function public.enforce_invite_limit to anon, authenticated;

grant execute on function public.event_role to anon, authenticated;

grant execute on function public.get_event_public to anon, authenticated;

grant execute on function public.get_invite to anon, authenticated;

grant execute on function public.host_update_event to anon, authenticated;

grant execute on function public.is_admin to anon, authenticated;

grant execute on function public.member_side to anon, authenticated;

grant execute on function public.public_rsvp to anon, authenticated;

grant execute on function public.respond to anon, authenticated;

grant execute on function public.rls_auto_enable to anon, authenticated;


-- ===== Storage buckets =====

insert into storage.buckets (id, name, public) values ('cards', 'cards', true) on conflict do nothing;

reset check_function_bodies;
