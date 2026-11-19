// payment-webhook (stub): where a real payment gateway (KNET / card) will report finished payments.
// No gateway is connected yet, so it answers 501 to everything. Not deployed.
// When a gateway is chosen: check the gateway's signature here, then call
// _v2_mark_paid(order, '<gateway>', '<its reference>') or _v2_mark_failed(...) with the service key.
// See supabase/README.md "Real payments later".
import { handlePaymentWebhook } from '../_shared/pay.ts';

const log = (msg: string, fields?: Record<string, unknown>) => console.log(JSON.stringify({ fn: 'payment-webhook', msg, ...fields }));
Deno.serve((req) => handlePaymentWebhook(req, {}, { log }));
