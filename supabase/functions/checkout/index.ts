// checkout: the host's "Pay" button. POST {order_id} with the host's login.
// The order (and its price) was made by start_checkout_v2 / request_change_v2 / approve_design_v2;
// this only checks it and says where to pay.
//
// Settings (Supabase → Edge Functions → Secrets; see supabase/README.md):
//   PAYMENT_MODE  test → {url: SITE_URL/pay.html?order=<id>} (the test gateway page)
//                 anything else / not set → 503 {error: 'payments_not_connected'}
//   SITE_URL      optional, default https://snalawwad.github.io/RSVP
//
// Deploy:  supabase functions deploy checkout --project-ref <ref>
import { handleCheckout } from '../_shared/pay.ts';
import { payDeps, payEnv } from '../_shared/deno_pay.ts';

const deps = payDeps('checkout');
Deno.serve((req) => handleCheckout(req, payEnv(), deps));
