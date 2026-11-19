# Sending door passes on WhatsApp

**What this does:** the day before each event (at 16:00 Kuwait time, unless you pick another time), every guest who said yes gets a WhatsApp message from Sina with a button that opens their door pass.

**Until every step below is done, nothing is sent.** Hosts can still send passes by hand from their own WhatsApp.

The same Meta account and number also send **login codes** (part D) and **invites after payment** (part E). Do parts A and B first.

**What you need:**
- About 1 hour, plus 1 to 3 days of waiting while Meta checks the business and the name
- The trade licence (for business verification)
- A payment card
- A **new SIM card** whose number has never been used on WhatsApp or WhatsApp Business

**What it costs:** about **$0.044 per message** in Kuwait (from third-party price lists). Check the real price on Meta's page before you start: <https://developers.facebook.com/docs/whatsapp/pricing>. For example, 300 confirmed guests ≈ $13. Messages that fail are not charged.

---

## Part A: Meta (Sara or Sama, no developer needed)

1. **Business account.** Go to <https://business.facebook.com> and create a business account named **Sina** (or open the one you have).
2. **New number.** Put the new SIM in any phone. **Don't install WhatsApp on it.** It only needs to receive one text message or call with a code.
3. **Business verification.** In **Business settings → Security centre → Start verification**, upload the trade licence. Meta may also ask for a website showing the business name (use `https://snalawwad.github.io/RSVP`) and a phone or email to send a code to. Meta takes 1 to 3 days. Until it's done you can only message 250 people a day.
4. **Create the app.**
   1. Go to <https://developers.facebook.com>, then **My Apps → Create app**.
   2. If Meta asks for a **use case**, choose **Connect with customers through WhatsApp**. If it asks for an **app type**, choose **Business**. Name it `Sina passes` and link it to the Sina business account.
   3. On the app page, **Add product → WhatsApp → Set up** (skip this if the use case already added WhatsApp).
5. **Add the number.**
   1. In **WhatsApp Manager → Phone numbers → Add phone number**, set the display name to `Sina` (Meta approves the name).
   2. Type the new number and enter the code it receives.
   3. Open the app → **WhatsApp → API Setup**. In the **From** list choose the **Sina** number, not the "Test number" Meta adds for you. Copy the **Phone number ID** shown under it (a long number, not the phone number itself). **Ignore the "Temporary access token" on this page.** It stops working after 24 hours. Step 7 makes the permanent one.
   4. Wait until the display name shows **Approved** in WhatsApp Manager → Phone numbers (usually 1 to 2 days). Until then the number can't send to guests.
   5. In the same place open the number → **Two-step verification** and set a 6-digit PIN. Write it down with the token.
   6. Keep this SIM topped up for as long as Sina sends passes: if the number expires, it can be given to someone else.
6. **Payment card.** Open <https://business.facebook.com/wa/manage/> (WhatsApp Manager). Click the **gear (Settings) → Payment methods → Add payment method** and add the card. Without a card, only the free test number can send.
7. **Permanent access token.**
   1. In **Business settings → Users → System users → Add**, add a user named `sina-sender` with the **Admin** role.
   2. Click **Assign assets**, then give it the app (full control) and the WhatsApp account (full control).
   3. Click **Generate new token**. Pick the app, choose **Never** for expiry, and tick `whatsapp_business_messaging` and `whatsapp_business_management`.
   4. Copy the token somewhere safe. **Never** put it in a chat, an email or the code.
8. **App secret.** In the app, open **App settings → Basic → App secret → Show** and copy it.
9. **Message template.** In **WhatsApp Manager → Message templates → Create template**, fill in:
   - **Category:** Utility
   - **Name:** `sina_door_pass`
   - **Languages:** Arabic **and** English. Add both under the same name. Choose plain "English", not "English (US)".

   **Arabic body** (paste exactly, keeping the line breaks):
   ```
   هلا {{1}}، بطاقة حضوركم لـ{{2}} جاهزة.
   الموعد: {{3}}.
   اضغطوا الزر تحت ووروا البطاقة عند الباب.
   ```
   **English body:**
   ```
   Hi {{1}}, your door pass for {{2}} is ready.
   It's on {{3}}.
   Tap the button below and show your pass at the door.
   ```
   **Footer (optional):** `سنة` for Arabic, `Sina` for English.

   **Button:** Call to action → **Visit website** → URL type **Dynamic**.
   - Button text: `بطاقة الحضور` (Arabic) or `Show my door pass` (English)
   - Website URL (both languages):
     ```
     https://snalawwad.github.io/RSVP/invite.html?t={{1}}
     ```

   **Samples** (Meta asks for them):
   - {{1}} = `نورة` / `Noura`
   - {{2}} = `زواج سارة وفهد` / `Sara & Fahad's wedding`
   - {{3}} = `الجمعة، ١٨ ديسمبر الساعة ٧:٠٠ م` / `Friday 18 December at 7:00 PM`
   - Button sample = `3f9a1c0b7e2d4a6f8b1c3e5d7f9a0b2c4d6e`

   Then submit. Approval usually takes minutes to a day. The template must say **Active** before going live.

## Part B: Supabase (test project first, then live with Sara's OK)

**Before you start:** in Terminal run `brew install supabase/tap/supabase`, then `supabase login` (a browser opens: press **Authorize**). Your **ref** is in Supabase → **Project Settings → General → Project ID** (letters like `abcdxyz…`). Every `<ref>` below means that value. Do all of Part B on the **test** project first.

10. **Database.** In Supabase, open **SQL Editor → New query**. Open `supabase/migrations/0005_door_pass.sql` in a text editor, copy all of it, paste it and press **Run**. Skip this if it already ran on this project. Then do the same with `supabase/migrations/0006_pass_sending.sql`. It adds the settings, with sending switched off everywhere. Always go in number order and never run a file twice.
11. **Make two random secrets.** In Terminal, run this twice and keep both results:
    ```
    openssl rand -hex 32
    ```
    The first result is the **cron secret**. The second is the **verify token**.
12. **Function secrets.** Use the values from steps 5, 7, 8 and 11. Don't save them in any file.
    ```
     supabase secrets set --project-ref <ref> CRON_SECRET=<cron secret> WHATSAPP_MODE=off \
      WHATSAPP_TOKEN=<token> WHATSAPP_PHONE_NUMBER_ID=<phone number id> \
      WHATSAPP_APP_SECRET=<app secret> WHATSAPP_VERIFY_TOKEN=<verify token>
    ```
    Type a space before `supabase` so the line isn't kept in Terminal's history, and close Terminal afterwards.

    Optional:
    - `WHATSAPP_TEMPLATE` (default `sina_door_pass`)
    - `WHATSAPP_LANG_AR` (default `ar`)
    - `WHATSAPP_LANG_EN` (default `en`; set it to `en_US` if you chose "English (US)")
13. **Deploy the two functions.**
    ```
    supabase functions deploy send-door-passes --no-verify-jwt --project-ref <ref>
    supabase functions deploy whatsapp-webhook --no-verify-jwt --project-ref <ref>
    ```
    `--no-verify-jwt` is needed because the schedule and Meta have no Supabase login. Instead, the first function checks the cron secret and the second checks Meta's signature.
14. **Connect the webhook.**
    1. In the Meta app, open **WhatsApp → Configuration → Webhook → Edit**.
    2. Callback URL: `https://<ref>.supabase.co/functions/v1/whatsapp-webhook`
    3. Verify token: the verify token from step 11.
    4. Click **Verify and save**, then **subscribe** to the `messages` field.
15. **Put the app live.** In the Meta app, open **App settings → Basic**. Set **Privacy Policy URL** to `https://snalawwad.github.io/RSVP/privacy.html`, pick a **Category** (Utilities), add an icon, and press **Save changes**. Then switch **App mode** at the top of the page from **Development** to **Live**. While the app is in Development mode, WhatsApp never says whether a message was delivered or read.
16. **Schedule.** In **SQL Editor → New query**:
    1. Paste these two lines with the real values, press **Run**, once only:
       ```sql
       select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-door-passes', 'sina_send_passes_url');
       select vault.create_secret('<cron secret>', 'sina_cron_secret');
       ```
    2. Open `supabase/cron/pass_sender.sql` in a text editor, copy all of it, paste it into a new query and press **Run**. It starts the sender every 10 minutes. While the mode is `off`, it does nothing.

## Part C: Test, then go live

17. **Turn it on in the site.** On github.com open the RSVP repository → `config.js` → pencil icon. Change `WHATSAPP_AUTO: false` to `WHATSAPP_AUTO: true`, then **Commit changes** to `main`. The site updates in about a minute; reload the admin page. Until then the switch on the admin page is greyed out. Nothing is sent yet: every event starts with the switch off.
18. **Test with yourselves only.**
    1. Make a test event dated tomorrow, with one guest: you, with your own number, who replies **yes**.
    2. In Terminal, set `WHATSAPP_MODE=live`:
       ```
       supabase secrets set --project-ref <ref> WHATSAPP_MODE=live
       ```
    3. On the admin page, open the test event's **Message and sending** step. Under **Door passes**, turn on **Send door passes on WhatsApp automatically**, then press **Show passes now**.
    4. Within 10 minutes, your phone gets the message. Tap the button: your door pass opens.
    5. On the Host dashboard, Home shows a **Door passes** card: "Sent to 1 of 1 guest", then "Delivered to 1", then "Read by 1".
    6. Turn the switch off for the test event.

    `WHATSAPP_MODE=mock` exists for testing on the test project. It marks guests as sent **without sending anything**, so never use it on live with a real event switched on.
19. **For each real event**, the admin turns on **Send door passes on WhatsApp automatically** (Message and sending step → Door passes). Passes go out the day before at 16:00, Kuwait time. **Change the time** sets another time, and **Show passes now** puts them on the invite links at once (WhatsApp sends them within 10 minutes). Tell the hosts their guests will get the pass from the WhatsApp number named **Sina**.

## Part D: Phone login codes on WhatsApp

Hosts and guests log in with their phone number and a code sent on WhatsApp. Until every step below is done, phone login stays hidden and email login works as today.

20. **Database and function.** `supabase/migrations/0007_self_serve.sql` must have run, and `auth-whatsapp-otp` must be deployed (`supabase/README.md`, "Going live", steps 1 and 3).
21. **Login code template.** In **WhatsApp Manager → Message templates → Create template**:
    - **Category:** Authentication
    - **Name:** `sina_login_code`
    - **Languages:** Arabic (and English if you like, under the same name)
    - **Code delivery:** Copy code. Tick "Add security recommendation". Code expiry: 10 minutes.

    Meta writes the text itself ("رمز التحقق الخاص بك هو …"). Submit and wait for **Active**.
22. **Switch on phone login in Supabase.**
    1. **Authentication → Providers → Phone** → turn it on and **Save**. You don't need an SMS provider: the hook replaces it.
    2. **Authentication → Hooks → Add hook → Send SMS hook**. Type **HTTPS**, URL `https://<ref>.supabase.co/functions/v1/auth-whatsapp-otp`. Press **Generate secret** and copy it (it starts `v1,whsec_`). Press **Create**.
    3. In Terminal:
       ```
        supabase secrets set --project-ref <ref> SEND_SMS_HOOK_SECRET='<the secret>' OTP_MODE=live
       ```
       (The quotes matter because the secret has a comma.) `OTP_MODE=mock` is for the test project only: it says the code was sent but sends nothing; the code is then only visible in Authentication → Users.
23. **Test with yourselves.** On the test site, set `LOGIN_PHONE: true` in `config.js`, log in with your own number, and check the code arrives on WhatsApp from **Sina**.
24. **Go live.** On github.com, `config.js` → `LOGIN_PHONE: true`, **Commit changes**. For the iPhone app, set `EXPO_PUBLIC_LOGIN_PHONE=true` in the next build.

**To switch phone login off at once:** `supabase secrets set --project-ref <ref> OTP_MODE=off` (logins by phone then say "not switched on"), and set `LOGIN_PHONE: false` again.

## Part E: Invites on WhatsApp after payment

When a host picks "WhatsApp" in **How we send** and pays, every guest with a phone gets their invite from the Sina number. Hosts can always still send by hand: guests WhatsApp couldn't reach stay on their send-by-hand list.

25. **Invite template.** **WhatsApp Manager → Message templates → Create template**, Category **Utility**, Name `sina_invite`, Arabic and English.

    **Arabic body:**
    ```
    هلا {{1}}، حياكم في {{2}}.
    الموعد: {{3}}.
    اضغطوا الزر تحت وردّوا علينا.
    ```
    **English body:**
    ```
    Hi {{1}}, you're invited to {{2}}.
    It's on {{3}}.
    Tap the button below to reply.
    ```
    **Button:** Visit website, Dynamic, text `الدعوة` / `Open the invite`, URL `https://snalawwad.github.io/RSVP/invite.html?t={{1}}`. Samples as for the door pass template.
26. **Deploy and schedule.** Deploy `send-invites` (README step 3). In SQL Editor, add its address once:
    ```sql
    select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-invites', 'sina_send_invites_url');
    ```
    then paste and run `supabase/cron/invite_sender.sql`.
27. **Switch on:** `supabase secrets set --project-ref <ref> INVITES_MODE=live`. To stop at once: `INVITES_MODE=off`.

SMS is saved as the host's choice but nothing sends SMS yet: those guests stay on the send-by-hand list.

## If something goes wrong

- **Stop everything at once:**
  ```
  supabase secrets set --project-ref <ref> WHATSAPP_MODE=off
  ```
- **See what happened:**
  - The Host dashboard's Home shows a **Door passes** card from 3 days before the event (or from the time passes come out, if that's earlier) until the day after: how many were sent, delivered and read, and a **Send by hand** list of guests WhatsApp couldn't reach. One tap on **Send pass** opens WhatsApp with that guest's message and link.
  - In Supabase, open **Edge Functions → send-door-passes → Logs**. Phone numbers there are masked.
- **Retries:** a message that fails is tried 3 times, 10 and 20 minutes apart. After that, the guest shows in the **Send by hand** list on the Host dashboard. A number that isn't on WhatsApp isn't retried.
- **No clear answer from WhatsApp** (it timed out, or WhatsApp had a server error): the message may have gone out anyway, so it is **not** sent again automatically. The guest goes straight to the **Send by hand** list. If WhatsApp did send it, the webhook moves the guest out of that list within a few minutes, so check the list again before you send by hand.
- **Token or template problems:** if the token is wrong or expired, the template isn't approved, or the card is refused, the sender stops after **one** message and tries again 10 minutes later. These don't count as one of the guest's 3 tries, so once you fix the problem every guest still gets theirs. If it isn't fixed within 30 minutes of the passes coming out, the guests show in the hosts' **Send by hand** list as running late.
- **"Account not registered" in the logs:** open the number in the app's **WhatsApp → API Setup** and finish registering it with the PIN from step 5.
- **Guest replies:** guests' replies to the Sina number aren't read, because the number has no WhatsApp app. Hosts stay the contact for questions.
- **Remove the schedule:**
  ```sql
  select cron.unschedule('sina-send-door-passes');
  ```
