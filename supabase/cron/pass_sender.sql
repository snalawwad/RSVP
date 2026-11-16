-- ======================================================================
-- Sina: start send-door-passes every 10 minutes (NOT a migration)
--
-- Run by hand at go-live, in Supabase → SQL Editor, after:
--   1. 0006_pass_sending.sql has run,
--   2. send-door-passes is deployed,
--   3. the two secrets below are in the Vault (step 16 in supabase/WHATSAPP_SETUP.md).
-- Nothing secret is in this file: the address and the secret are read from the Vault
-- each time the job runs.
--
-- Vault secrets (create once in SQL Editor, with the real values; never commit them):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-door-passes', 'sina_send_passes_url');
--   select vault.create_secret('<the same text as the CRON_SECRET function secret>', 'sina_cron_secret');
--
-- Safe to run again (it replaces the job).
-- TO STOP IT:   select cron.unschedule('sina-send-door-passes');
-- TO SEE RUNS:  select * from cron.job_run_details order by start_time desc limit 20;
--               select id, status_code, left(content, 300) from net._http_response order by id desc limit 20;
-- ======================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'sina_send_passes_url')
     or not exists (select 1 from vault.decrypted_secrets where name = 'sina_cron_secret') then
    raise exception 'Stopped, nothing scheduled. Add the Vault secrets sina_send_passes_url and sina_cron_secret first.';
  end if;
  if exists (select 1 from cron.job where jobname = 'sina-send-door-passes') then
    perform cron.unschedule('sina-send-door-passes');
  end if;
end $$;

select cron.schedule('sina-send-door-passes', '*/10 * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sina_send_passes_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sina_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$job$);

select jobid, jobname, schedule, active from cron.job where jobname = 'sina-send-door-passes';
