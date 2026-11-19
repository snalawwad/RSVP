# Notes for App Review (App Store Connect → App Review Information)

Paste the text under "Notes" into App Store Connect, and fill in the sign-in fields as below.

## Sign-in required: yes

The app signs in with a 6-digit code sent by email (no password). Supabase can't fix an email code, so the reviewer reads the code in a mailbox we give them.

| Account | Email (user name) | "Password" field | What it shows |
|---|---|---|---|
| Demo host | `sina.review.host@gmail.com` (or any new mailbox) | that mailbox's password | A host with one upcoming demo event: overview, guests, invite, arrivals, package, account |
| Demo door | `sina.review.door@gmail.com` | that mailbox's password | Door staff for the same event: search, check in, scan pass, ask the host |

(Later, once phone login is switched on, Supabase → Authentication → Providers → Phone → "Test phone numbers and OTPs" can give two test numbers a fixed code, and no mailbox is needed.)

## What Sara must create before submitting (live Supabase, after the pilot)

1. **Two new mailboxes** (for example two Gmail accounts) with no 2-step login, used only for review. Log in to the app once with each so the Supabase users exist.
2. **One demo event** (from the admin page, as the Sina team): title "Demo wedding", a date a few weeks after submission, a venue, status active, package Plus (door included), about 12 made-up guests with fake numbers (965000000xx) in every state: coming, can't make it, no reply, one checked in. Add a door request ("not on the list, 2 people").
3. **Members:** the host mailbox as host, the door mailbox as door, on that event.
4. Keep the demo event until the review is done; move its date forward if a review takes longer.

## Notes text for App Review

> Sina runs invitations, replies and door check-in for events in Kuwait. Events are set up by the Sina team; the app shows hosts the events they host, guests the invites sent to their number, and door staff the guest list at the door.
>
> To sign in: tap "Log in", type the demo email, tap "Send code", then open that mailbox (gmail.com, password below) and type the 6-digit code from the newest email. Demo host: sina.review.host@gmail.com / mailbox password ……. Demo door staff: sina.review.door@gmail.com / mailbox password …….
>
> There are no purchases of any kind in the app: no in-app purchase, no paid content, no subscription, and no links or buttons that lead to buying anything outside the app. Packages are arranged with the Sina team outside the app; the app only shows, read-only, how many invites an event's package allows.
>
> The camera is used only on the door screen to scan a guest's door pass QR code. The calendar is used write-only when a guest taps "Add to calendar".
>
> Account deletion: Account → Delete account.

## Things the reviewer may ask about

- **"Sign up" with no event:** the home screen says "Events you host or are invited to show up here." That's expected for a new account.
- **WhatsApp:** hosts open WhatsApp to send each guest their invite themselves; the app doesn't send messages on their behalf.
- **Arabic:** switch language in Account → Language; the app lays out right to left.
