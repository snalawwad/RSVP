# RSVP

Digital invitations and RSVPs for events in Kuwait. A static site on GitHub Pages with a Supabase database. No build step: every file is served as-is.

| File | What it is |
| --- | --- |
| `invite.html` | Guest page. Personal link (`?t=…`) or the event's shared link (`?e=…`) |
| `host.html` | Host dashboard: replies, guests, invite design, RSVP rules, door requests, activity |
| `admin.html` | Admin (Sara and Sama): events, hosts and door staff, card, guest lists, sending |
| `door.html` | Door check-in by name, with a head count. Arabic and English |
| `index.html` | Sends visitors to the host dashboard (keeps login links working) |
| `config.js` | Supabase URL, publishable key, site address, support WhatsApp |
| `core.js`, `style.css` | Shared code and design |
| `migrations/` | Database changes, in order, with an undo file for each |

The publishable key in `config.js` is meant to be public. The database rules decide what each person can see. Never put a `service_role` or secret key in this repository.

## Database upgrade: `migrations/002_mvp_core.sql`

The pages work with or without this upgrade. Until it is installed, they behave exactly as before. Once it is installed, these switch on automatically:

- **Extras (+0 to +5).** Each guest can bring up to 5 extra people. Guests with extras choose how many are coming.
- **RSVP rules.** A reply-by date, whether guests can change their reply, and whether the shared link takes new replies.
- **Door check-in with numbers.** Check in part of a party now and the rest later. Two door phones can't double count.
- **Door requests.** The door asks the host about someone unlisted or extra people. The host approves or turns down from the dashboard. Door staff can't approve their own requests.
- **Door access end date.** Door staff lose access after the date the admin sets (default: the day after the event).
- **Host corrections.** Change a guest's reply, head count or extras by hand.
- **Activity log.** Replies, changes, check-ins and decisions, with who did them.
- **Limits enforced by the database.** 1 to 6 seats per guest, and the package limit, even when two imports run at once.

### To install

1. Supabase → **SQL Editor** → **New query**.
2. Paste the whole of `migrations/002_mvp_core.sql` and tap **Run**. You should see **Upgrade finished**.
3. If it says **Stopped, nothing changed**, the database isn't shaped the way the file expects. Nothing was changed. Send the message to Claude.

It is safe to run more than once. It only adds things; it doesn't change or remove any existing function, so links already sent keep working.

### To undo

Run `migrations/002_rollback.sql` the same way. Pages fall back to the old behaviour. Door requests and the activity log are deleted. Guest replies are kept.

## Sending invites

Invites are sent one by one from your own WhatsApp: the **Send** button opens the chat with the message ready, and you tap send. The dashboard records that WhatsApp was opened, not that the message was delivered. Automatic sending from a business number needs an approved WhatsApp Business provider (with its own costs and approval). That isn't set up yet.

## Before going live

- Test on a test event with made-up names and your own number, never a real event.
- Check on an iPhone and an Android phone, in Arabic and English.
- Replace `SUPPORT_WHATSAPP` in `config.js` with the business number (the help link stays hidden until then).

## Testing

Changes are tested on a local copy of the database in headless Chrome. Nothing touches the live site or real guests. The test scripts live outside this repository.
