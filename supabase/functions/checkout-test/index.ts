// checkout-test: the test gateway's "Pay" / "Fail" buttons on pay.html.
// POST {order_id, outcome: 'paid' | 'failed'} with the host's login.
// Works only while PAYMENT_MODE=test; never takes real money.
// Paid → _v2_mark_paid (the event opens, or the change / design request starts). Failed → the order is marked failed.
//
// Deploy:  supabase functions deploy checkout-test --project-ref <ref>
// Before real payments go live: set PAYMENT_MODE to something other than test (or delete this function).
import { handleCheckoutTest } from '../_shared/pay.ts';
import { payDeps, payEnv } from '../_shared/deno_pay.ts';

const deps = payDeps('checkout-test');
Deno.serve((req) => handleCheckoutTest(req, payEnv(), deps));
