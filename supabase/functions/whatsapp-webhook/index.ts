// whatsapp-webhook: Meta tells us here when a door pass message was sent, delivered, read or failed.
// Updates public.pass_sends (forward only) through pass_send_status_update, passing back the guest id
// the sender put in each message (biz_opaque_callback_data) so a message whose id was never saved still matches.
//
// Settings (Supabase → Edge Functions → Secrets; see supabase/WHATSAPP_SETUP.md):
//   WHATSAPP_VERIFY_TOKEN  any long random text; typed into Meta's webhook form as "Verify token"
//   WHATSAPP_APP_SECRET    Meta app → App settings → Basic → App secret (checks each post is really from Meta)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
//
// Deploy:  supabase functions deploy whatsapp-webhook --no-verify-jwt
// (--no-verify-jwt because Meta has no Supabase login; the signature check guards it.)
// Webhook URL for Meta: https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { handleWebhookRequest, type Env, type Rpc } from '../_shared/pass.ts';

// Read the settings on every request, so a new WHATSAPP_MODE takes effect without a redeploy.
const env = (): Env => Object.fromEntries(['WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET'].map((k) => [k, Deno.env.get(k)]));

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const rpc: Rpc = async (fn, args) => {
  const { data, error } = await db.rpc(fn, args);
  return { data, error: error ? { message: error.message } : null };
};
const log = (msg: string, fields?: Record<string, unknown>) => console.log(JSON.stringify({ fn: 'whatsapp-webhook', msg, ...fields }));

Deno.serve((req) => handleWebhookRequest(req, env(), { rpc, log }));
