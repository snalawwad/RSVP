// delete-account: deletes the signed-in host's account and their data.
// Called by the host app after the host confirms. Runs on Supabase's servers, where
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided
// automatically. The service key never leaves the server.
//
// Deploy (test project first):  supabase functions deploy delete-account
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1. Who is asking? Check their login token with Supabase Auth.
  const auth = req.headers.get('Authorization') ?? '';
  const jwt = auth.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'not_signed_in' }, 401);
  const asUser = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: who, error: whoErr } = await asUser.auth.getUser(jwt);
  if (whoErr || !who?.user) return json({ error: 'not_signed_in' }, 401);
  const user = who.user;

  // The app must send {"confirm": "DELETE"} so a stray call can't delete anything.
  let body: { confirm?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  if (body.confirm !== 'DELETE') return json({ error: 'confirmation_required' }, 400);

  const admin = createClient(url, service, { auth: { persistSession: false } });

  // 2. Remove their data (refuses admin accounts).
  const { data: result, error: dataErr } = await admin.rpc('delete_account_data', {
    p_user: user.id,
    p_email: user.email ?? '',
  });
  if (dataErr) {
    const isAdmin = /admin accounts/.test(dataErr.message);
    return json({ error: isAdmin ? 'admin_account' : 'delete_failed' }, isAdmin ? 403 : 500);
  }

  // 3. Remove card images of the deleted events (folder per event id in the "cards" bucket).
  const eventIds: string[] = result?.event_ids ?? [];
  for (const id of eventIds) {
    const { data: files } = await admin.storage.from('cards').list(id, { limit: 1000 });
    if (files?.length) await admin.storage.from('cards').remove(files.map((f) => `${id}/${f.name}`));
  }

  // 4. Delete the login itself.
  const { error: authErr } = await admin.auth.admin.deleteUser(user.id);
  if (authErr) return json({ error: 'login_delete_failed' }, 500);

  return json({ ok: true, events_deleted: eventIds.length });
});
