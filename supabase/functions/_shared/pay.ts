// Payments: everything the checkout, checkout-test and payment-webhook functions do, testable with plain Node.
// The price is never taken from the app: start_checkout_v2 (0007_self_serve.sql) works it out and
// stores it on the order; these functions only move an existing order along.
// Rules: never log a login token; only order ids reach the logs.
import type { Env, Log, Rpc } from './pass.ts';
import { scrub } from './pass.ts';

export const DEFAULT_SITE = 'https://snalawwad.github.io/RSVP';
export type PayMode = 'off' | 'test';

/** PAYMENT_MODE: 'test' turns on the test gateway; anything else (or nothing) = off. */
export function readPayMode(v: string | undefined): PayMode {
  return String(v ?? '').trim().toLowerCase() === 'test' ? 'test' : 'off';
}

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** The caller's login token from "Authorization: Bearer …", or ''. */
export function bearer(req: Request): string {
  return (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** userRpc runs a database function as the caller (their login token); serviceRpc as the server. */
export interface PayDeps {
  userRpc: (jwt: string, fn: string, args: Record<string, unknown>) => ReturnType<Rpc>;
  serviceRpc: Rpc;
  log?: Log;
  ref?: () => string;   // tests only: the test gateway's reference
}

interface Order { id: string; status: string; kind: string; amount_fils: number }

/** Common start: POST, signed in, a valid order id, and the caller hosts that order's event. */
async function loadOrder(req: Request, deps: PayDeps):
  Promise<{ res: Response } | { jwt: string; order: Order; body: Record<string, unknown> }> {
  if (req.method !== 'POST') return { res: reply({ error: 'method_not_allowed' }, 405) };
  const jwt = bearer(req);
  if (!jwt) return { res: reply({ error: 'not_signed_in' }, 401) };
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const id = String(body?.order_id ?? '');
  if (!UUID_RE.test(id)) return { res: reply({ error: 'bad_request' }, 400) };
  const { data, error } = await deps.userRpc(jwt, 'order_status_v2', { p_order: id });
  if (error) {
    if (/not allowed/i.test(error.message)) return { res: reply({ error: 'not_allowed' }, 403) };
    if (/jwt|token|auth/i.test(error.message)) return { res: reply({ error: 'not_signed_in' }, 401) };
    deps.log?.('order lookup failed', { order: id, error: scrub(error.message) });
    return { res: reply({ error: 'server_error' }, 500) };
  }
  const order = data as Order;
  if (!order || order.status !== 'pending') return { res: reply({ error: 'not_pending', status: order?.status ?? null }, 409) };
  return { jwt, order, body };
}

/**
 * checkout. POST {order_id} with the host's login.
 * PAYMENT_MODE=test → {url: SITE_URL + '/pay.html?order=<id>', mode: 'test'}; otherwise 503 payments_not_connected.
 */
export async function handleCheckout(req: Request, env: Env, deps: PayDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const r = await loadOrder(req, deps);
  if ('res' in r) return r.res;
  if (readPayMode(env.PAYMENT_MODE) !== 'test') return reply({ error: 'payments_not_connected' }, 503);
  const site = (env.SITE_URL || DEFAULT_SITE).replace(/\/+$/, '');
  deps.log?.('checkout', { order: r.order.id, mode: 'test' });
  return reply({ url: `${site}/pay.html?order=${r.order.id}`, mode: 'test', order_id: r.order.id, amount_fils: r.order.amount_fils });
}

/**
 * checkout-test. POST {order_id, outcome: 'paid' | 'failed'} with the host's login.
 * Only while PAYMENT_MODE=test (otherwise 403 test_mode_off). Marks the order paid (which opens the
 * event, or starts the change / design request) or failed.
 */
export async function handleCheckoutTest(req: Request, env: Env, deps: PayDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method === 'POST' && readPayMode(env.PAYMENT_MODE) !== 'test') return reply({ error: 'test_mode_off' }, 403);
  const r = await loadOrder(req, deps);
  if ('res' in r) return r.res;
  const outcome = r.body.outcome;
  if (outcome !== 'paid' && outcome !== 'failed') return reply({ error: 'bad_request' }, 400);
  const ref = deps.ref ? deps.ref() : 'test-' + crypto.randomUUID();
  const fn = outcome === 'paid' ? '_v2_mark_paid' : '_v2_mark_failed';
  const { data, error } = await deps.serviceRpc(fn, { p_order: r.order.id, p_gateway: 'test', p_ref: ref });
  if (error) {
    deps.log?.('mark failed', { order: r.order.id, outcome, error: scrub(error.message) });
    return reply({ error: 'server_error' }, 500);
  }
  deps.log?.('test payment', { order: r.order.id, outcome });
  return reply({ order_id: r.order.id, status: (data as { status?: string })?.status ?? outcome });
}

/**
 * payment-webhook (stub). A real gateway (KNET / card) will post here when a payment finishes.
 * Until one is connected it accepts nothing: 501 not_implemented. See supabase/README.md "Real payments later".
 */
export async function handlePaymentWebhook(req: Request, _env: Env, deps: { log?: Log }): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  deps.log?.('payment webhook called while no gateway is connected', { method: req.method });
  return reply({ error: 'not_implemented' }, 501);
}
