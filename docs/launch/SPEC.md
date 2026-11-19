# Sina launch: build Sama's Figma end to end

Branch: `launch`. Started 19 Nov 2026. Goal: the website and iPhone app match Sama's Figma and are ready to release (website on GitHub Pages, app on the App Store).

## Hard rules (read first)

1. **Ghala's private pilot is live (event code `laylatghala`, 20 Nov 2026).** Do not push, do not merge to `main`, and do not write to the live Supabase project `hexnxpufurftldpfcukd`. Read-only SQL against live is allowed only to learn the schema. Test against the fake backend (see Testing).
2. **Database changes only add.** New tables, columns and functions are fine. Never drop or rename anything the live pages use. If an existing function must change, keep its signature and make sure it still returns everything it returned before (a superset). New file: `supabase/migrations/0007_self_serve.sql`. Never edit 0000 to 0006.
3. **Brand.** The Figma says "RSVP"; the business is **Sina**, in Arabic **سنة**. Use `config.js` `BRAND` / `BRAND_EN` on the web, and the same words in the app. Never print "RSVP" as the name. The mark is Sama's arch (doorway) icon from the Figma; it is the only logo. Do not invent another.
4. **Arabic and English.** Every screen works in both, RTL for Arabic. Arabic is designed as Arabic, not mirrored English:
   - no dash kickers, letter-spaced labels or single-letter initial circles in Arabic;
   - natural Kuwaiti plural address (حياكم، اكتبوا), correct dual and plural, one term per concept;
   - fonts: Noto Naskh Arabic for headings, Noto Kufi Arabic for text; Latin uses Fraunces and DM Sans (as now).
   - The guest invite page keeps its own fonts.
5. **Taste rules.**
   - Buttons are verb plus object; headings name things.
   - One button pair, one card style, one radius scale.
   - 44px tap targets, no overflow at 320px, visible focus rings.
   - Quiet hover/press only, no fade-in on scroll.
   - AA contrast.
   - No slop words, and no `{token}` left showing to users (except the message template editor, where `{name}` and `{link}` are the feature).
6. **Payments.**
   - Packages: Basic 15 KWD (50 invites, no door), Plus 35 KWD (150, door included), Premium 75 KWD (400, door plus design included). Door check-in add-on +10 KWD. Each change after sending 10 KWD. "Ask us to design it" 15 KWD, paid only when the host approves the draft.
   - Payment runs through a **test gateway** for now (KNET and card radio, as in Figma P2). The RSVP team can also mark an order paid by hand in admin.
   - **The iPhone app never takes payment** and never points to the website to pay (Apple rule). In the app: no "create event", no package, no pay, no "pay for changes" buttons, and no "go to the website" text. The app runs existing events and shows guests their invites.
7. **Login is a phone number and a code on WhatsApp** (Figma 02, 02b, 03, G08, G09), with email-code login as the fallback. `config.js` `LOGIN_PHONE: false` (and app env `EXPO_PUBLIC_LOGIN_PHONE`) keeps phone login hidden until the WhatsApp OTP hook is switched on, so email login is what works today. Build both.
8. **Sama's open questions** (sticky note): "add payment journey" (covered by P1, P1a, P2, 24i) and "do u need a door staff person?" (Basic has no door; P1 add-on). Nothing extra to build.
9. Keep commits small and messages plain. Do not push. End commit messages with:
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Figma

File key `2U3uN0UAeoQUq9sSaMgDW5`, page `1:5` "Start to finish", design system page `1:4`.

Use the Figma MCP tools:
- call `create_session` first;
- then `get_screenshot` (pass `maxDimension`) and `get_design_context` on the node ids below.

Build to the frames. If a frame breaks a hard rule above, follow the rule and note it in your report.

**Host** (section `140:3785`):
- **1 Get started:** 01 Welcome `50:13920`; 02 Create account `54:5565`; 02b Log in `54:5599`; 03 Enter code `52:3006`; 03a/03b/03c code states `73:3535` `73:3589` `73:3650`; 04 Home, no events `52:3032`.
- **2 Create and send:**
  - 06 Name `54:5705` (06a `120:3567`); 07 When `54:5779` (07a `120:3645`); 08 Where `54:5942` (08a `120:3808`); 09 Team `46:2778` (09a `120:3903`).
  - 10 Design `46:2876`, with 10a Style `102:3488`, 10b Language `102:3544`, 10c Add a cover `102:3586`, 10d Upload `102:3637`, 10e Ask us to design it `102:3673`, 10f Request sent `102:3733`.
  - 11 Guests `46:2969` (11a `120:3984`); 11b Add guest, just them `130:3838`; 11c Add guest, can bring people `135:3727`.
  - P1 Pick a package `149:3765`; P1a Plus, door included `149:3865`; S1 How we send `224:4067`; 12 Review and send `46:3107`; P2 Pay `149:3966`; 13 Sent `235:3572`; 13a Sent, no door `237:3555`.
  - 06b `46:2671` is NOT used.
- **3 Follow replies:**
  - 24g Your events `151:4222`; 24e Event home `151:4081`; 24c Invite tab `15:2228`.
  - 24k What would you like to do `237:3601`; 24l Add more people `237:3657`; 24m Invite sent `237:3732`.
  - 24h Change the invite `215:4354`; 24i Pay for changes `215:4423`; 24j Changes requested `215:4508`.
  - 24b Account `17:2187`; 17 Guests `132:3873`; 17a Edit guest `132:4051`; 24f Your package `151:4159`.
- **5 After the event:** 27 `52:3079`; 27a no door `151:4014`.
- Section 4 is missing in the Figma. Nothing to build for it.

**Guest** (`140:3877`):
- **1 Reply, can bring people:** G01 Invite `40:1068`; G01a Can't make it `40:1415`; G04 Who's coming `40:1109`; G04a `120:4119`; G05 Confirmed `40:1147`.
- **2 Reply, just them:** G06 `134:3664`; G06a `134:3779`; G07 Confirmed `159:16074`.
- **3 Come back any time:**
  - G08 Log in `143:3874`; G09 Code `143:3907`; G10 Your invites `143:3951`; G10a None `143:4015`; G10b Account `143:4048`.
  - G11 Invite page `139:3738`; G11a Door pass `40:1183`; G11b Add to calendar `145:3900`; G11c Added `145:4016`; G12 Change reply `139:3800`; G13 Reply updated `139:3841`.

**Door staff** (`140:3999`):
- 19 Idle `13:709`; 20 Search `14:124`; 21 Guest arrives `15:883`.
- 22 Not on the list `16:3836`; 23 Ask the host `16:400`; 23a `120:4176`; 23b Big group `16:611`; 25 Host answers `16:3970`; 25a My requests `16:4229`.

**Website** (`219:4093`): W01 Landing desktop `219:4096`; W02 Landing mobile `219:4330`; W03 Invite page desktop `236:3448`.
- W01 note: "Create your event" goes to Host 01; "See an example" opens Guest G01.
- W03 note: shown when a guest opens their link on a computer; on a phone they get the Guest screens.

**RSVP team (admin)** (`55:5977`): Events list `13:985`; New event `18:1008`; Details `15:126`; Team `16:3356`; Design `16:3619`; Guests `17:4197`; Send `17:4483`.

## Database contract (0007_self_serve.sql)

All new functions are `security definer`, have `set search_path = public`, check the caller themselves, and are granted only to the roles that need them. All amounts are in **fils** (1 KWD = 1000 fils).

### Tables and columns

- **`packages`** (`code` pk: `basic` / `plus` / `premium`)
  - Columns: `name_en`, `name_ar`, `price_fils`, `invite_limit`, `door_included`, `design_included`, `sort`, `active`.
  - Seeds: basic 15000 / 50 / f / f; plus 35000 / 150 / t / f; premium 75000 / 400 / t / t.
- **`prices`** (`code` pk, `price_fils`). Seeds: `door_addon` 10000, `invite_change` 10000, `design` 15000.
- **`events`** gets these columns:
  - `status` text not null default `'active'`, check `draft` / `active` / `done` / `cancelled`. Existing rows stay `active`, so the pilot is untouched.
  - `package` text (fk packages, null for old events); `door_addon` bool default false.
  - `send_channel` text default `'by_hand'`, check `whatsapp` / `sms` / `by_hand`.
  - `design_style` text; `paid_at` timestamptz.
- **`event_members`** gets `phone` text (digits only, e.g. `96599887766`), `name` text and `user_id` uuid.
  - Roles: existing `host` / `door` plus new **`cohost`**. A co-host sees names, party sizes and replies only, not phone numbers, and cannot edit the list.
- **`orders`**
  - Columns: `id`, `event_id`, `kind` (`package` / `door_addon` / `invite_change` / `design`), `amount_fils`, `status` (`pending` / `paid` / `failed` / `cancelled`), `method` (`knet` / `card` / `manual`), `gateway` (`test` / `manual` / later real), `gateway_ref`, `related_id`, `created_by`, `created_at`, `paid_at`.
  - Row security on, no policies.
- **`change_requests`**
  - Columns: `id`, `event_id`, `what`, `wording`, `colours`, `photos` text[], `status` (`awaiting_payment` / `requested` / `in_progress` / `done` / `cancelled`), `order_id`, `created_by`, `created_at`, `done_at`.
- **`design_requests`**
  - Columns: `id`, `event_id`, `idea`, `wording`, `colours`, `photos` text[], `status` (`requested` / `draft_sent` / `approved` / `cancelled`), `draft_url`, `order_id`, `created_at`.
- **`profiles`** (`user_id` pk, `name`, `phone`, `email`, `created_at`).

### Who is who

- Phone users have no email. Membership checks (`event_role`, `can_host`, `can_door`, `_v2_role` and the rest) must match an `event_members` row by email **or** by phone (from `auth.jwt()->>'phone'`) **or** by `user_id`.
- Add `_v2_phone()`, which returns the caller's phone as digits.
- Email users must get exactly the same results as today.

### Host RPCs (signed in)

- `create_event_v2(p jsonb) returns uuid`
  - Any signed-in user can call it. It creates an event with `status='draft'`, `created_by=auth.uid()`, a generated `public_code`, and `invite_limit = 400` while in draft.
  - It also adds the caller as an `event_members` row with role `host` (with their email, phone and user_id).
  - At most 20 drafts per user.
- `update_event_v2(p_event uuid, p jsonb) returns jsonb`
  - Host only. Allowed keys: `title`, `event_type`, `starts_at`, `ends_at`, `venue`, `map_url`, `map_spot`, `invite_line`, `headline`, `lang`, `theme_accent`, `theme_paper`, `card_image_url`, `design_style`, `message_template`, `send_channel`, `note`, `rsvp_deadline`.
  - `package` and `door_addon` are allowed only while the event is a draft.
  - Returns the event as JSON.
- `my_events_v2() returns jsonb`
  - Events the caller hosts, co-hosts or works the door for.
  - Each item: role, status, counts (invited, said yes in people, said no, no reply, arrived), package, `door` (bool: package door or add-on).
- Team:
  - `list_members_v2(p_event)`;
  - `add_member_v2(p_event, p_name, p_phone, p_email, p_role)` (role `cohost` or `door`; host only);
  - `remove_member_v2(p_member uuid)`.
- `cohost_guests_v2(p_event)`: name, seats, status, confirmed_count, checked_in_count, side. Never phone or token.
- `quote_v2(p_event, p_package text, p_door boolean) returns jsonb`
  - Returns `{items:[{kind,label_en,label_ar,amount_fils}], total_fils, guest_count, fits:boolean}`.
  - It refuses a package whose `invite_limit` is less than the guests already added.
- `start_checkout_v2(p_event, p_package, p_door, p_method) returns uuid`
  - Host only, event must be a draft. Recomputes the amount on the server and creates a pending `package` order (door included in the amount).
  - Returns the order id.
- `request_change_v2(p_event, p_what, p_wording, p_colours, p_photos text[], p_method) returns jsonb`
  - Creates a change request (`awaiting_payment`) and a pending `invite_change` order.
  - Returns `{request_id, order_id}`.
- `request_design_v2(p_event, p_idea, p_wording, p_colours, p_photos text[]) returns uuid`
  - Status `requested`, no order yet. Premium includes design, so its later order amount is 0 and it is auto-paid.
- `approve_design_v2(p_request, p_method) returns uuid`: creates the design order and returns its id. A 0 amount is paid at once.
- `event_orders_v2(p_event)` and `event_requests_v2(p_event)`: lists for the host.
- `order_status_v2(p_order) returns jsonb`: for the pay result page; host of that event only.

### Payment (test gateway)

- Internal `_v2_mark_paid(p_order uuid, p_gateway text, p_ref text)`, idempotent:
  - order → `paid`;
  - `package` → event `status='active'`, `package`, `door_addon`, `invite_limit` = package limit, `paid_at`;
  - `invite_change` → request `requested`;
  - `design` → request `approved`.
- `admin_mark_paid_v2(p_order, p_note)`: admin only, gateway `manual`.
- Edge function **`checkout`** (POST `{order_id}`, caller's JWT)
  - Checks the caller hosts the order's event and the order is pending.
  - With secret `PAYMENT_MODE=test`, returns `{url: SITE + '/pay.html?order=<id>'}`.
  - Otherwise returns 503 `{error:'payments_not_connected'}`.
- Edge function **`checkout-test`** (POST `{order_id, outcome:'paid'|'failed'}`, caller's JWT)
  - Works only when `PAYMENT_MODE=test`.
  - Calls `_v2_mark_paid`, or marks the order failed.
- A real gateway later adds a `payment-webhook` function. Leave a stub with a clear README section.

### Draft events

- `get_invite_v2`, `public_rsvp_v2` and `door_list_v2` treat a `draft` event like a closed link (`{closed:'not_ready'}`), except for the event's host or co-host previewing it.
- Add `preview_invite_v2(p_event)`, which returns what `get_invite_v2` would show for a sample guest (Figma "Preview as a guest").

### Guests with an account

- `my_invites_v2() returns jsonb`
  - Matches guests whose normalised `phone` equals the caller's phone.
  - Each item: `token`, `event` (title, starts_at, venue, map_url, card_image_url, lang), `status`, `seats`, `confirmed_count`, `responded_at`, past or upcoming.
  - Sorted: upcoming first, then past.
- `my_profile_v2()` and `save_profile_v2(p_name, p_email)`.

### Sending invites

- `events.send_channel` comes from S1.
- After payment, when WhatsApp is connected (the 0006 settings), queue each guest's invite with a new `invite` message kind, using the same queue and sender pattern as `send-door-passes`. Add an edge function `send-invites`, off until Meta is connected.
- SMS: the channel is stored, and the sender is a stub (no provider yet), so those guests stay in the host's send-by-hand list.
- The host's existing send-by-hand list is always the fallback.

### WhatsApp login code

- Edge function **`auth-whatsapp-otp`**: a Supabase Auth "Send SMS hook".
  - It verifies the standard-webhooks signature with secret `SEND_SMS_HOOK_SECRET` and sends the code with a WhatsApp authentication template through the Meta Cloud API, using the same secrets as 0006.
  - Document the switch-on steps in `WHATSAPP_SETUP.md` (Auth → Providers → Phone on, Auth → Hooks → Send SMS hook → this function).

### Admin (RSVP team)

- `admin_orders_v2(p_status text default null)`, `admin_requests_v2()` (design and change requests across events, with event title and host).
- `admin_set_request_v2(p_kind text, p_id uuid, p_status text, p_draft_url text default null)`.
- `admin_set_package_v2(p_event, p_package, p_door)` for fixing things by hand.

## Who owns which files (avoid merge conflicts)

| Track | Owns | May read |
|---|---|---|
| db | `supabase/**`, `WHATSAPP_SETUP.md`, `docs/launch/API.md` | everything |
| web-public | `index.html`, `invite.html`, `style.css`, `assets/brand/**`, `privacy.html`, `support.html`, `legal.*`, new `terms.html`, `ghala.html` must keep working | `core.js`, `config.js` |
| web-host | `host.html`, `host.css`, `core.js`, `config.js`, new `auth.js`, new `pay.html`, new `me.html` (guest account G08 to G13 hub), new `new.html` if the create flow needs its own page | everything |
| web-door-admin | `door.html`, `door.css`, `admin.html`, `admin.css` | everything |
| app | `app/**` | everything |

- If you need something in a file you don't own, put it in your own file, or write the need in your report.
- `core.js` changes by web-host must not break door or admin: functions are only added; the `requireLogin` signature stays the same.

## Testing

- **Fake backend rig:** copy `/private/tmp/claude-501/-Users-saraalawwad/8b645535-d154-453c-a860-8635e57e7e4d/scratchpad/harness` into your own scratch folder; do not edit the shared copy.
  - `mock.mjs` runs PGlite with the repo's SQL and headless Chrome. It intercepts `https://mock.supabase.test` and `https://snalawwad.github.io/RSVP` and serves the repo given by env `REPO`.
  - Existing suites to learn from: `e2e_host.mjs`, `e2e_door.mjs`, `e2e_admin.mjs`, `e2e_pass.mjs`, `app_e2e_host.mjs`, `app_e2e_door.mjs`, `taste_check.mjs`.
  - The mock JWT only carries an email; add a phone claim in your copy if you need it.
- **Database:** `cd supabase/tests && npm test` (embedded Postgres). It must stay all-pass.
- **App:**
  - run `npx tsc --noEmit` and `npx expo lint` in `app/`;
  - render through the web build with the rig (`app_rig.mjs`);
  - `app/.env.local` already points at the mock.
- **Before finishing:**
  - screenshot your screens at 390 and 320 wide (and 1440 for website pages), in Arabic and English;
  - compare them side by side with the Figma frames;
  - fix differences.

## Done means

Every Figma frame in your track is built and reachable, works in Arabic and English, passes your tests, and is committed on your branch. Your final report lists:
- what was built (by Figma id);
- anything you couldn't build and why;
- every deviation from the Figma and the rule behind it;
- anything another track must do.
