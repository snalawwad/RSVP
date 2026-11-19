// Deno-only wiring shared by checkout and checkout-test: database calls as the caller and as the server.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import type { PayDeps } from './pay.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

export function payDeps(fnName: string): PayDeps {
  return {
    userRpc: async (jwt, fn, args) => {
      const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await asUser.rpc(fn, args);
      return { data, error: error ? { message: error.message } : null };
    },
    serviceRpc: async (fn, args) => {
      const { data, error } = await service.rpc(fn, args);
      return { data, error: error ? { message: error.message } : null };
    },
    // only order ids and outcomes reach the logs, never the login token
    log: (msg, fields) => console.log(JSON.stringify({ fn: fnName, msg, ...fields })),
  };
}

// Read the settings on every request, so a new PAYMENT_MODE takes effect without a redeploy.
export const payEnv = () => Object.fromEntries(['PAYMENT_MODE', 'SITE_URL'].map((k) => [k, Deno.env.get(k)]));
