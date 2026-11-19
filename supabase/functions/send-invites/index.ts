// send-invites: sends each guest of a paid event their invite on WhatsApp, when the host chose WhatsApp
// (events.send_channel). Started every 10 minutes by supabase/cron/invite_sender.sql; nobody else can
// start it (x-cron-secret). Guests it can't reach stay on the host's send-by-hand list.
//
// Settings (Supabase → Edge Functions → Secrets):
//   CRON_SECRET               the same secret as send-door-passes
//   INVITES_MODE              off (default: does nothing) | mock (no messages, for testing) | live
//   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID   the same as the door passes (live only)
//   WHATSAPP_INVITE_TEMPLATE  template name (default sina_invite)
//   WHATSAPP_LANG_AR / _EN    template language codes (default ar / en)
//
// Deploy:  supabase functions deploy send-invites --no-verify-jwt --project-ref <ref>
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import type { Env, Rpc } from '../_shared/pass.ts';
import { handleInvitesRequest } from '../_shared/invites.ts';

// Read the settings on every request, so a new INVITES_MODE takes effect without a redeploy.
const env = (): Env => Object.fromEntries(['CRON_SECRET', 'INVITES_MODE', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_INVITE_TEMPLATE', 'WHATSAPP_LANG_AR', 'WHATSAPP_LANG_EN'].map((k) => [k, Deno.env.get(k)]));

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const rpc: Rpc = async (fn, args) => {
  const { data, error } = await db.rpc(fn, args);
  return { data, error: error ? { message: error.message } : null };
};
// Only masked phones and guest ids reach the logs.
const log = (msg: string, fields?: Record<string, unknown>) => console.log(JSON.stringify({ fn: 'send-invites', msg, ...fields }));

Deno.serve(async (req) => {
  const res = await handleInvitesRequest(req, env(), { rpc, fetch, log });
  if (res.status !== 401 && res.status !== 405) log('run', { status: res.status, summary: await res.clone().json().catch(() => null) });
  return res;
});
