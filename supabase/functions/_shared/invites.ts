// Invites on WhatsApp after payment: everything the send-invites function does, testable with plain Node.
// Same queue and sender as the door passes (pass.ts runSender), with its own database functions
// (invite_send_claim / invite_send_result in 0007_self_serve.sql), its own template and its own switch.
// Rules: never log a full phone number or invite token; never keep message text.
import {
  buildPayload, liveSender, mockSender, readMode, runSender, safeEqual,
  type Claim, type Env, type Log, type Rpc, type Sender, type TemplateOptions,
} from './pass.ts';

export const DEFAULT_INVITE_TEMPLATE = 'sina_invite';

/**
 * The invite message: template body {{1}} guest name, {{2}} event, {{3}} date and time in Kuwait;
 * URL button <SITE_URL>/invite.html?t={{1}} with the invite token.
 * WhatsApp sends 'invite:<guest id>' back with each delivery update, so whatsapp-webhook
 * knows it is about an invite and not a door pass.
 */
export function buildInvitePayload(c: Claim, o: TemplateOptions) {
  const b = buildPayload(c, o);
  if (b.ok) b.body.biz_opaque_callback_data = 'invite:' + String(c.guest_id);
  return b;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export interface InviteDeps {
  rpc: Rpc;
  fetch?: typeof fetch;
  send?: Sender;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: Log;
  batch?: number;
}

/**
 * send-invites. POST only, with header x-cron-secret = CRON_SECRET.
 * INVITES_MODE: off (default; claims nothing) | mock (no network, marks sent) | live (Meta Cloud API).
 * Only paid, active events whose host chose WhatsApp (events.send_channel) are sent; SMS and
 * "by hand" guests stay on the host's send-by-hand list.
 */
export async function handleInvitesRequest(req: Request, env: Env, deps: InviteDeps): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const secret = env.CRON_SECRET ?? '';
  if (secret.length < 16) return json({ error: 'not_configured' }, 500);
  if (!safeEqual(req.headers.get('x-cron-secret') ?? '', secret)) return json({ error: 'unauthorized' }, 401);
  const mode = readMode(env.INVITES_MODE);
  if (mode === 'off') return json({ mode: 'off' });
  if (mode === 'live') {
    const missing = ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'].filter((k) => !env[k]);
    if (missing.length) return json({ error: 'missing_config', missing }, 500);
  }
  const send = deps.send ?? (mode === 'live' ? liveSender(env, deps.fetch ?? fetch) : mockSender);
  const summary = await runSender({
    mode, rpc: deps.rpc, send, now: deps.now, sleep: deps.sleep, log: deps.log, batch: deps.batch,
    claimFn: 'invite_send_claim', resultFn: 'invite_send_result', build: buildInvitePayload,
    template: env.WHATSAPP_INVITE_TEMPLATE || DEFAULT_INVITE_TEMPLATE,
    langAr: env.WHATSAPP_LANG_AR || 'ar',
    langEn: env.WHATSAPP_LANG_EN || 'en',
  });
  return json(summary, summary.stopped === 'claim_error' ? 500 : 200);
}
