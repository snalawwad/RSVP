// send-door-passes: sends each confirmed guest their door pass on WhatsApp once it is released
// (by default the day before the event at 16:00 Kuwait time). Started every 10 minutes by the
// schedule in supabase/cron/pass_sender.sql; nobody else can start it (x-cron-secret).
//
// Settings (Supabase → Edge Functions → Secrets; see supabase/WHATSAPP_SETUP.md):
//   CRON_SECRET               long random text, the same as vault secret 'sina_cron_secret'
//   WHATSAPP_MODE             off (default: does nothing) | mock (no messages, for testing) | live
//   WHATSAPP_TOKEN            Meta permanent access token          (live only)
//   WHATSAPP_PHONE_NUMBER_ID  Meta "Phone number ID"               (live only)
//   WHATSAPP_TEMPLATE         template name (default sina_door_pass)
//   WHATSAPP_LANG_AR / _EN    template language codes (default ar / en)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
//
// Deploy:  supabase functions deploy send-door-passes --no-verify-jwt
// (--no-verify-jwt because the schedule has no login; the x-cron-secret header guards it.)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { handleSendRequest, type Env, type Rpc } from '../_shared/pass.ts';

// Read the settings on every request, so a new WHATSAPP_MODE takes effect without a redeploy.
const env = (): Env => Object.fromEntries(['CRON_SECRET', 'WHATSAPP_MODE', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TEMPLATE', 'WHATSAPP_LANG_AR', 'WHATSAPP_LANG_EN'].map((k) => [k, Deno.env.get(k)]));

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const rpc: Rpc = async (fn, args) => {
  const { data, error } = await db.rpc(fn, args);
  return { data, error: error ? { message: error.message } : null };
};
// Only masked phones and guest ids reach the logs (see _shared/pass.ts).
const log = (msg: string, fields?: Record<string, unknown>) => console.log(JSON.stringify({ fn: 'send-door-passes', msg, ...fields }));

Deno.serve(async (req) => {
  const res = await handleSendRequest(req, env(), { rpc, fetch, log });
  if (res.status !== 401 && res.status !== 405) log('run', { status: res.status, summary: await res.clone().json().catch(() => null) });
  return res;
});
