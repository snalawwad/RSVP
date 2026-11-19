-- ======================================================================
-- Sina: start send-invites every 10 minutes (NOT a migration)
--
-- Run by hand at go-live, in Supabase → SQL Editor, after:
--   1. 0007_self_serve.sql has run,
--   2. send-invites is deployed,
--   3. the Vault has 'sina_cron_secret' (made for the door passes) and the address below.
--
-- Vault secret (create once, with the real project ref; never commit it):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-invites', 'sina_send_invites_url');
--
-- Safe to run again (it replaces the job).
-- TO STOP IT:   select cron.unschedule('sina-send-invites');
-- ======================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'sina_send_invites_url')
     or not exists (select 1 from vault.decrypted_secrets where name = 'sina_cron_secret') then
    raise exception 'Stopped, nothing scheduled. Add the Vault secrets sina_send_invites_url and sina_cron_secret first.';
  end if;
  if exists (select 1 from cron.job where jobname = 'sina-send-invites') then
    perform cron.unschedule('sina-send-invites');
  end if;
end $$;

select cron.schedule('sina-send-invites', '*/10 * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sina_send_invites_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sina_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$job$);

select jobid, jobname, schedule, active from cron.job where jobname = 'sina-send-invites';
