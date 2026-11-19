# Database files

The live database (Supabase project `hexnxpufurftldpfcukd`) is kept as files here, so every change is written down and tested before it reaches live events.

## What each file is

| File | What it is |
| --- | --- |
| `migrations/0000_baseline.sql` | What the live database had on 12 Nov 2026, before the MVP upgrade. **Never run on live.** Only for building a test copy. |
| `../migrations/002_mvp_core.sql` | The MVP upgrade (plus-ones, partial arrivals, door requests, activity log). **Already run on live.** Kept in the root `migrations/` folder with its rollback file. |
| `migrations/0003_account_deletion.sql` | Account deletion: one new table and two new functions. **Not on live yet.** |
| `migrations/0004_door_undo.sql` | Lets the door undo its own check-in within 10 minutes (one new function). **Not on live yet** (the door page hides Undo until it is). |
| `migrations/0005_door_pass.sql` | A door pass with a QR code for every guest (code like SN-1234, plus a secret key kept in a locked table). **Not on live yet.** How to remove it is at the top of the file. |
| `migrations/0006_pass_sending.sql` | Door passes go out on WhatsApp the day before (two event settings, one table of what was sent, the sending functions). Nothing is sent by the file itself. **Not on live yet.** |
| `migrations/0007_self_serve.sql` | Hosts make and pay for their own events. **Not on live yet.** Adds: the price list (packages Basic 15 KWD / Plus 35 KWD / Premium 75 KWD, door add-on 10 KWD, change 10 KWD, design 15 KWD); orders; change and design requests; profiles; event status (draft / active / done / cancelled: **every existing event stays active**); co-hosts (see names and replies, never phone numbers); phone-number logins; guests' "my invites" list; invites sent on WhatsApp after payment; the Sina team's admin tools. A draft event's links stay closed to guests and door staff until it is paid. Nothing is charged or sent by the file itself. The full list of calls is in `docs/launch/API.md`. |
| `functions/delete-account/` | The server function the app calls to delete an account. |
| `functions/send-door-passes/` | Sends door passes on WhatsApp once released. Started every 10 minutes by `cron/pass_sender.sql`. Does nothing until `WHATSAPP_MODE` is set. **Not deployed yet.** |
| `functions/whatsapp-webhook/` | Where WhatsApp reports delivered / read / failed, for door passes and invites. **Not deployed yet.** |
| `functions/checkout/` | The host's Pay button: checks the order and gives the payment page link. Answers "payments not connected" unless `PAYMENT_MODE=test`. **Not deployed yet.** |
| `functions/checkout-test/` | The test payment page's Pay / Fail buttons. Works only while `PAYMENT_MODE=test`; never takes real money. **Not deployed yet.** |
| `functions/payment-webhook/` | Placeholder for a real payment company later. Answers "not implemented" to everything. **Don't deploy yet.** |
| `functions/send-invites/` | Sends each guest of a paid event their invite on WhatsApp, if the host chose WhatsApp. Started every 10 minutes by `cron/invite_sender.sql`. Does nothing until `INVITES_MODE` is set. **Not deployed yet.** |
| `functions/auth-whatsapp-otp/` | Sends phone login codes on WhatsApp (Supabase's "Send SMS hook"). Refuses until `OTP_MODE` is set, so phone login stays off. **Not deployed yet.** |
| `functions/_shared/` | The logic of the functions above (`pass.ts`, `invites.ts`, `pay.ts`, `otp.ts`), tested on the Mac without Deno. `deno_pay.ts` is the Supabase-only wiring. |
| `cron/pass_sender.sql`, `cron/invite_sender.sql` | The 10-minute schedules. **Not migrations**: run by hand at go-live. They read their address and secret from the Supabase Vault. |
| `WHATSAPP_SETUP.md` | Step-by-step WhatsApp setup for Sara and Sama (Meta account, number, templates, secrets, phone login). |
| `tests/` | Runs all the files on a throwaway Postgres on this Mac and checks the rules (478 checks). Never touches Supabase. |
| `export_live_schema.sql` | Read-only query to export the live structure again if needed. |

## Rules

1. **Only add.** New tables, columns and functions are fine. Never drop, rename or change what the live pages use.
2. **One new numbered file per change**, continuing from the highest number (next is `0008_…sql`). Never edit a file that has already run on live.
3. **Test first:** `npm test` in `supabase/tests`, then run on the test project, then (with Sara's OK) on live.
4. **Nothing on live before 20 Nov 2026** (Ghala's shower) unless it's urgent.

## Test locally (on this Mac)

```bash
cd supabase/tests && npm install && npm test
```

## Set up the free test project (once)

1. In Supabase, create a new project on the **Free** plan (for example `rsvp-test`). It costs nothing.
2. In its **SQL Editor**, run `supabase/migrations/0000_baseline.sql`, then `migrations/002_mvp_core.sql`, then every file from `0003` to `0007` in number order (see "Going live" below).
3. In **Authentication → URL Configuration**, set the same Site URL and redirects as live, and add `Your code: {{ .Token }}` to the Magic Link email template.
4. Point the app at it: create `app/.env.local` with the test project's URL and publishable key (see `app/.env`).

## Going live (after the pilot, test project first, then live with Sara's OK)

Do every step on the **test project first**, check the site and app against it, then repeat on live. Commands need the Supabase CLI (`brew install supabase/tap/supabase`, then `supabase login`). `<ref>` is the project's ID (Project Settings → General).

**1. Database files, in this order, one at a time** (SQL Editor → New query → paste the whole file → Run; each says "… added" at the end; if one stops with "Stopped, nothing changed", don't go on):

1. `migrations/0003_account_deletion.sql`
2. `migrations/0004_door_undo.sql`
3. `migrations/0005_door_pass.sql`
4. `migrations/0006_pass_sending.sql`
5. `migrations/0007_self_serve.sql`

Each file only adds, so the live guest, host, admin and door pages keep working after each one. After `0007`, the existing pilot event is still `active` and works exactly as before.

**2. Secrets** (Edge Functions → Secrets, or in Terminal; type a space before `supabase` so the line isn't kept in history):

```
 supabase secrets set --project-ref <ref> PAYMENT_MODE=test SITE_URL=https://snalawwad.github.io/RSVP
```

| Secret | What to put | Used by |
|---|---|---|
| `PAYMENT_MODE` | `test` (test payment page, no real money). Remove it, or set `off`, to close payments ("payments not connected"). | checkout, checkout-test |
| `SITE_URL` | `https://snalawwad.github.io/RSVP` (optional, that's the default) | checkout |
| `SEND_SMS_HOOK_SECRET` | the secret Supabase shows when you add the Send SMS hook (step 4), starting `v1,whsec_` | auth-whatsapp-otp |
| `OTP_MODE` | `off` until WhatsApp is ready, then `live` (`mock` only on the test project: it "sends" without sending) | auth-whatsapp-otp |
| `INVITES_MODE` | `off` until WhatsApp is ready, then `live` | send-invites |
| `WHATSAPP_INVITE_TEMPLATE`, `WHATSAPP_OTP_TEMPLATE`, `WHATSAPP_OTP_LANG` | optional: `sina_invite`, `sina_login_code`, `ar` are the defaults | send-invites, auth-whatsapp-otp |
| `CRON_SECRET`, `WHATSAPP_MODE`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | as in `WHATSAPP_SETUP.md` (shared by the door passes, invites and login codes) | the WhatsApp functions |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase automatically. Never put a secret in a file or a chat.

**3. Deploy the functions:**

```
supabase functions deploy delete-account --project-ref <ref>
supabase functions deploy checkout --project-ref <ref>
supabase functions deploy checkout-test --project-ref <ref>
supabase functions deploy send-door-passes --no-verify-jwt --project-ref <ref>
supabase functions deploy whatsapp-webhook --no-verify-jwt --project-ref <ref>
supabase functions deploy send-invites --no-verify-jwt --project-ref <ref>
supabase functions deploy auth-whatsapp-otp --no-verify-jwt --project-ref <ref>
```

`checkout` and `checkout-test` keep the login check on (only signed-in hosts). The others have their own check (the cron secret, Meta's signature, or the hook signature). Don't deploy `payment-webhook` yet.

**4. Dashboard switches:**

- **Email login stays as it is** (Authentication → Providers → Email on, with the `Your code: {{ .Token }}` line).
- **Phone login, only when WhatsApp is ready** (WHATSAPP_SETUP.md part D): Authentication → Providers → **Phone** → on (any SMS provider setting is ignored once the hook is on). Then Authentication → **Hooks** → **Send SMS hook** → type **HTTPS** → URL `https://<ref>.supabase.co/functions/v1/auth-whatsapp-otp` → **Generate secret**, copy it into `SEND_SMS_HOOK_SECRET` → **Create**. Then set `OTP_MODE=live`, and on the site set `LOGIN_PHONE: true` in `config.js` (and `EXPO_PUBLIC_LOGIN_PHONE=true` for the app).
- **Schedules** (SQL Editor): `cron/pass_sender.sql` (door passes) and, once the invite template is approved, `cron/invite_sender.sql` (invites), after adding their Vault secrets as written at the top of each file.

**5. Check:** open the pilot event's invite, host and door pages (they must look exactly as before), then make a test event as a new host, pay on the test page, and see it open.

## Real payments later

When a payment company (KNET / card) is chosen:

1. Write `functions/payment-webhook/` to check that company's signature and then call `_v2_mark_paid(order, '<company>', '<their reference>')` (or `_v2_mark_failed`) with the service key. Both are already in 0007 and are safe to call twice.
2. Change `checkout` so that, in a new mode (for example `PAYMENT_MODE=live`), it asks the company for a payment page and returns that link instead of `pay.html`.
3. Set `PAYMENT_MODE` away from `test` so `checkout-test` stops working.

Until then the Sina team can mark an order paid by hand from the admin page (`admin_mark_paid_v2`).
