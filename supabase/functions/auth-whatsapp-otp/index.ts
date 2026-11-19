// auth-whatsapp-otp: Supabase Auth's "Send SMS hook". Sends the phone login code on WhatsApp
// (an "authentication" template with a copy-code button) instead of a text message.
//
// Settings (Supabase → Edge Functions → Secrets; steps in supabase/WHATSAPP_SETUP.md part D):
//   SEND_SMS_HOOK_SECRET   the secret Supabase shows when you add the hook ("v1,whsec_…")
//   OTP_MODE               off (default: refuses, so phone login stays off) | mock (sends nothing) | live
//   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID   the same as the door passes
//   WHATSAPP_OTP_TEMPLATE  template name (default sina_login_code)
//   WHATSAPP_OTP_LANG      template language (default ar)
//
// Deploy:  supabase functions deploy auth-whatsapp-otp --no-verify-jwt --project-ref <ref>
// (--no-verify-jwt because Supabase Auth calls it without a login; the webhook signature guards it.)
import { handleOtpHook } from '../_shared/otp.ts';
import type { Env } from '../_shared/pass.ts';

const env = (): Env => Object.fromEntries(['SEND_SMS_HOOK_SECRET', 'OTP_MODE', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_OTP_TEMPLATE', 'WHATSAPP_OTP_LANG'].map((k) => [k, Deno.env.get(k)]));
// Masked phones only; the code itself is never logged.
const log = (msg: string, fields?: Record<string, unknown>) => console.log(JSON.stringify({ fn: 'auth-whatsapp-otp', msg, ...fields }));

Deno.serve((req) => handleOtpHook(req, env(), { fetch, log }));
