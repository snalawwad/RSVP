# Sina API (0007 self-serve): what the pages and the app may call

Source of truth: `supabase/migrations/0007_self_serve.sql` and `supabase/functions/**`. Tests: `supabase/tests/self_serve.js`.
All amounts are **fils** (1 KWD = 1000 fils). All RPCs are `POST /rest/v1/rpc/<name>` with named arguments (`supabase.rpc('name', {p_event: …})`).

## Conventions

- **Who** column: `anon` = logged out, `signed in` = any login, `host` = host of that event (or admin), `full host` = host not limited to one list (`side`), `cohost`, `door`, `admin` (Sina team), `server` = service key only (edge functions).
- **Errors** come back as a PostgREST error whose `message` is the code below. Permission problems are always `Not allowed` (same text as the old functions). A logged-out call to a signed-in-only function gives `permission denied for function …` (HTTP 401/403).
- **Draft events** (`status = 'draft'`): guests and door staff see a closed link; host, co-host and admin can preview.
- Phone logins: the JWT `phone` claim (digits, e.g. `96599887766`) is matched against `event_members.phone`; email logins are matched by email exactly as before; `event_members.user_id` matches `auth.uid()`.

## Tables the pages may read directly

| Table | Who | Notes |
|---|---|---|
| `packages` | anyone (select only) | `code` (`basic`/`plus`/`premium`), `name_en`, `name_ar`, `price_fils`, `invite_limit`, `door_included`, `design_included`, `sort`, `active` |
| `prices` | anyone (select only) | `door_addon` 10000, `invite_change` 10000, `design` 15000, with `label_en`, `label_ar` |
| `events` | host/door (as before; row rule `can_door`) | new columns `status`, `package`, `door_addon`, `send_channel`, `design_style`, `paid_at`. **A co-host cannot read `events` or `guests` rows**: use `my_events_v2` / `cohost_guests_v2`. |
| `orders`, `change_requests`, `design_requests`, `profiles`, `invite_sends` | nobody | only through the functions below |

## Host: create and edit

| Function | Who | Returns | Errors |
|---|---|---|---|
| `create_event_v2(p jsonb)` | signed in | `uuid` of a new draft (`invite_limit` 400, caller added as `host` with their email/phone/user id). `p` may hold any key of `update_event_v2`; a missing title becomes `مناسبة جديدة` / `New event`. | `TOO_MANY_DRAFTS` (20 per user), `BAD_PACKAGE`, `BAD_CHANNEL` |
| `update_event_v2(p_event uuid, p jsonb)` | host | the event row as JSON (all columns) | `Not allowed`, `NOT_DRAFT` (package/door after payment), `BAD_PACKAGE`, `BAD_CHANNEL` |
| `my_events_v2()` | signed in | array, see below | |
| `preview_invite_v2(p_event)` | host, cohost, admin | same shape as `get_invite_v2` with a sample guest, plus `"preview": true` | `Not allowed` |

`update_event_v2` keys: `title, event_type, starts_at, ends_at, venue, map_url, map_spot, invite_line, headline, lang ('ar'|'en'), theme_accent ('#RRGGBB'), theme_paper, card_image_url, design_style, message_template, send_channel ('whatsapp'|'sms'|'by_hand'), note, rsvp_deadline`, and only while draft: `package`, `door_addon`. Empty string clears a text field (title can't be cleared). Other keys (`status`, `invite_limit`, `paid_at`, …) are ignored. A host limited to one list can't set `package`/`door_addon`.

`my_events_v2()` item:
```json
{"id":"…","title":"Sara & Fahad","event_type":"wedding","starts_at":"2026-12-18T16:00:00+00:00","ends_at":null,
 "venue":"Bayan Palace","card_image_url":null,"lang":"en","public_code":"a1b2c3d4e5f6",
 "role":"host","status":"draft","package":"plus","door_addon":false,"door":true,"send_channel":"whatsapp",
 "invite_limit":400,"paid_at":null,
 "counts":{"invited":3,"invited_people":6,"yes":0,"yes_people":0,"no":0,"no_reply":3,"arrived":0}}
```
`role`: `host` | `cohost` | `door`. `door` = package includes door or add-on bought. Order: upcoming (and undated) first, soonest first, then past (newest first). A host limited to one list gets counts for that list.

## Team

| Function | Who | Returns | Errors |
|---|---|---|---|
| `list_members_v2(p_event)` | host | `[{"id","event_id","name","role","phone","email","side","expires_at","created_at","is_me"}]`, host first | `Not allowed` |
| `add_member_v2(p_event, p_name, p_phone, p_email, p_role)` | full host | the member object above | `BAD_ROLE` (only `cohost`/`door`), `BAD_PHONE`, `BAD_EMAIL`, `PHONE_OR_EMAIL_REQUIRED`, `ALREADY_MEMBER`, `Not allowed` |
| `remove_member_v2(p_member uuid)` | full host | `{"ok":true,"id":"…"}` | `CANNOT_REMOVE_HOST`, `Not allowed` |
| `cohost_guests_v2(p_event)` | host, cohost, admin | rows `id, name, seats, status, confirmed_count, checked_in_count, side, responded_at` (never phone or token) | `Not allowed` |

Phones are stored as digits (`+965 5555 0001`, `55550001` and Arabic digits all become `96555550001`). Adding a door person does not check the package (Basic has no door: the UI should hide the door role for Basic events).

A co-host gets `Not allowed` from `door_list_v2`, `door_pass_lookup_v2`, `check_in_v2`, `host_set_reply_v2`, `list_members_v2`, `quote_v2`, orders, requests, pass/invite status, audit log, and cannot read `guests`/`events` rows.

## Prices and checkout

| Function | Who | Returns | Errors |
|---|---|---|---|
| `quote_v2(p_event, p_package, p_door boolean)` | full host | see below | `BAD_PACKAGE`, `Not allowed` |
| `start_checkout_v2(p_event, p_package, p_door, p_method)` | full host, event is draft | `uuid` of a pending `package` order | `NOT_DRAFT`, `PACKAGE_TOO_SMALL`, `BAD_METHOD` (`knet`/`card`), `BAD_PACKAGE`, `Not allowed` |
| `order_status_v2(p_order)` | full host of that event | order JSON + `event_title`, `event_status` | `Not allowed` |
| `event_orders_v2(p_event)` | full host | array of order JSON, newest first | `Not allowed` |

```json
// quote_v2(e, 'basic', true)
{"items":[{"kind":"package","code":"basic","label_en":"Basic","label_ar":"الأساسية","amount_fils":15000},
          {"kind":"door_addon","code":"door_addon","label_en":"Door check-in","label_ar":"تسجيل الحضور عند الباب","amount_fils":10000}],
 "total_fils":25000,"guest_count":54,"invite_limit":50,"fits":false,"package":"basic","door":true}
```
- `guest_count` = invites already used (sum of `seats`, the same count the invite limit uses). `fits:false` = the package is too small; the quote still comes back so P1 can show it greyed, and `start_checkout_v2` refuses it with `PACKAGE_TOO_SMALL`.
- No door line when the package includes the door (Plus, Premium).
- A `design` line (15 KWD) is added if a design was approved free under Premium in a draft and the host then picks a package without design.
- Order JSON: `{"id","event_id","kind","amount_fils","status","method","gateway","package","door","related_id","created_at","paid_at"}`. `status`: `pending`/`paid`/`failed`/`cancelled`.

## Changes and design

| Function | Who | Returns | Errors |
|---|---|---|---|
| `request_change_v2(p_event, p_what, p_wording, p_colours, p_photos text[], p_method)` | full host, event not draft | `{"request_id":"…","order_id":"…"}` (request `awaiting_payment`, order 10000 pending) | `IS_DRAFT` (edit a draft directly, free), `BAD_METHOD`, `Not allowed` |
| `request_design_v2(p_event, p_idea, p_wording, p_colours, p_photos text[])` | full host | `uuid` (status `requested`, no order) | `Not allowed` |
| `approve_design_v2(p_request, p_method)` | full host | `uuid` of the design order. Package with design (Premium): amount 0, paid at once, request `approved`. Otherwise a 15000 pending order (calling again returns the same order). | `NO_DRAFT_YET` (team hasn't sent a draft), `BAD_METHOD`, `Not allowed` |
| `event_requests_v2(p_event)` | host | array; change: `{"kind":"change","id","event_id","what","wording","colours","photos","status","order_id","created_at","done_at"}`; design: `{"kind":"design",…,"idea","draft_url",…}` | `Not allowed` |

Photos are URLs (upload to the `cards` bucket as today); at most 10 are kept.

## Paying (edge functions)

`POST https://<ref>.supabase.co/functions/v1/<name>`, header `Authorization: Bearer <login token>` (supabase-js `functions.invoke` does this).

| Function | Body | Answer |
|---|---|---|
| `checkout` | `{"order_id":"…"}` | `200 {"url":"https://snalawwad.github.io/RSVP/pay.html?order=<id>","mode":"test","order_id","amount_fils"}` when `PAYMENT_MODE=test`; `503 {"error":"payments_not_connected"}` otherwise |
| `checkout-test` | `{"order_id":"…","outcome":"paid"\|"failed"}` | `200 {"order_id","status":"paid"\|"failed"}`; `403 {"error":"test_mode_off"}` unless `PAYMENT_MODE=test` |
| `payment-webhook` | (gateway) | stub: always `501 {"error":"not_implemented"}` |

Common errors: `401 not_signed_in`, `400 bad_request` (bad order id or outcome), `403 not_allowed` (not the full host of that order's event), `409 {"error":"not_pending","status":"paid"}`, `405`, `500 server_error`. Any amount sent in the body is ignored. Paid package → event `active`, `package`, `door_addon`, `invite_limit` = package limit, `paid_at`; paid change → request `requested`; paid design → `approved`.

pay.html flow: read `order` from the URL → `rpc('order_status_v2')` for the amount → KNET/card radio → `functions.invoke('checkout-test', {body:{order_id, outcome:'paid'}})` → `order_status_v2` again for the result.

## Guests: draft behaviour (changed functions, same signatures)

| Function | Draft event, guest / stranger / door | Host, co-host, admin |
|---|---|---|
| `get_invite_v2(p_token)` | `{"closed":"not_ready"}` | normal invite |
| `public_rsvp_v2(…)` | `{"closed":"not_ready"}`, nothing saved | normal |
| `get_event_public_v2(p_code)` | `{"closed":"not_ready"}` | normal |
| `respond_v2(…)` | error `NOT_READY` | normal |
| `door_list_v2(p_event)` | door: error `NOT_READY` (table result, so no JSON) | host/admin: rows; cohost: `Not allowed` as before |

Active events: exactly as before. Pages must check `closed` before reading `name`/`title`.

## Guests with an account (G08–G13)

| Function | Who | Returns |
|---|---|---|
| `my_invites_v2()` | signed in | array (empty for a login without a phone). Item: `{"token","status","seats","confirmed_count","responded_at","past":false,"event":{"title","starts_at","venue","map_url","card_image_url","lang"}}`. `event.title` is the headline if set, else the title. Upcoming first (soonest first), then past. Draft events are left out. Open the invite with `invite.html?t=<token>`. |
| `my_profile_v2()` | signed in | `{"user_id","name","phone","email","is_admin"}` (phone/email from the login when present) |
| `save_profile_v2(p_name, p_email)` | signed in | same as `my_profile_v2`. `BAD_EMAIL`. The profile email is contact info only, it never gives access. Also sets the name on the caller's host rows. |

## Sending

| Function | Who | Returns |
|---|---|---|
| `invite_send_status_v2(p_event)` | host | `{"channel":"whatsapp","paid":true,"counts":{"sending","sent","delivered","read","failed"}}` |

After payment, if `send_channel = 'whatsapp'`, `send-invites` (every 10 min, off until `INVITES_MODE` is set) sends each guest who has a phone, hasn't replied and isn't marked sent; a sent invite sets `guests.sent_at`. SMS is stored only. Everyone else stays on the host's existing send-by-hand list (guests with `sent_at` empty).

## Admin (Sina team)

| Function | Returns | Errors |
|---|---|---|
| `admin_orders_v2(p_status text default null)` | order JSON + `event_title`, `event_status`, `gateway_ref`, `host:{name,email,phone}` | `Not allowed` |
| `admin_requests_v2()` | change + design requests (shapes above) + `event_title`, `host` | `Not allowed` |
| `admin_set_request_v2(p_kind 'change'\|'design', p_id, p_status, p_draft_url default null)` | the request row | `BAD_KIND`, `BAD_STATUS`, `NOT_FOUND`, `Not allowed` |
| `admin_set_package_v2(p_event, p_package, p_door)` | event row (sets package, door, invite limit; status unchanged) | `BAD_PACKAGE`, `NOT_FOUND` |
| `admin_mark_paid_v2(p_order, p_note)` | `{"order_id","status":"paid","already":false}` (gateway `manual`) | `ORDER_NOT_FOUND`, `Not allowed` |

Change statuses: `awaiting_payment, requested, in_progress, done, cancelled`. Design: `requested, draft_sent, approved, cancelled` (send `draft_sent` with `p_draft_url` so the host can approve).

## Server only (service key; never from a page)

`_v2_mark_paid(p_order, p_gateway, p_ref)` (idempotent: a paid order returns `{"already":true}` and changes nothing), `_v2_mark_failed(p_order, p_gateway, p_ref)`, `invite_send_claim(p_limit)`, `invite_send_result(p_guest, p_ok, p_msg_id, p_error)`, `invite_send_status_update(p_msg_id, p_status, p_error, p_guest)`.

## Login code on WhatsApp

`auth-whatsapp-otp` is called by Supabase Auth, not by pages. Pages use the normal `supabase.auth.signInWithOtp({phone:'+96599887766'})` and `verifyOtp({phone, token, type:'sms'})`. With `OTP_MODE` off the request fails with "WhatsApp login is not switched on" (keep `LOGIN_PHONE:false` until it is on).

## PGlite rig: what it must add for 0007

Checked with a copy of the fixed rig (`base.sql` = `auth_stub.sql` + `0000_baseline.sql`, pgcrypto loaded): **0007 loads and runs twice cleanly**, and the calls above work. Three things the rig must do for the new screens:

1. **A different `sub` per login.** The stock `asRole` sets only `auth.ctx.email`, so every login has sub `00000000-…-0001`. 0007 matches members by `user_id = auth.uid()`, so with one shared sub **every rig user becomes host of every event made with `create_event_v2`** (verified). Fix in `asRole`: read `sub` (and `phone`) from the mock JWT too: `update auth.ctx set email = $1, phone = $2, sub = $3`, and make `jwtFor(email, {phone, sub})` put a distinct sub per person (for example a UUID made from the email or phone).
2. **An `auth.users` row for that sub.** `events.created_by` references `auth.users(id)`, so `create_event_v2` fails with a foreign-key error without it. Insert one row per test person (`insert into auth.users(id, email, phone) values (…)`) before they create an event.
3. **Phone-only logins**: set `auth.ctx.phone` (digits, `96599887766`) and leave `email` null; `auth.jwt()` already includes the phone claim when set. The session in localStorage should then carry `user.phone` instead of `user.email`.

Edge functions are not served by the rig (`/functions/v1/*` gives 404). To fake a payment: call `admin_mark_paid_v2` as an admin login, or `select public._v2_mark_paid('<order>','test','rig')` as superuser (`asSuper`). To fake `checkout`/`checkout-test`, intercept `https://mock.supabase.test/functions/v1/checkout*` and answer with `handleCheckout` / `handleCheckoutTest` from `supabase/functions/_shared/pay.ts` (Node 22.18+ imports .ts), giving it `userRpc` that runs the RPC through `handleRest` with the request's JWT and `serviceRpc` that runs as superuser.
