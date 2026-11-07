# Setup from your phone

Everything is in one folder with no sub-folders, so you can upload it to GitHub from your phone. There is one SQL file to paste.

| File | What it is |
| --- | --- |
| `invite.html` | The guest page (opens from the WhatsApp link) |
| `host.html` | Host app: replies, decline reasons, add or remove guests |
| `admin.html` | You and Sama: event details, card, guest list, sending |
| `door.html` | Door check-in (not needed for the MVP) |
| `index.html` | Simple landing page |
| `config.js` | Your Supabase keys and site address go here |
| `setup.txt` | The whole database, in one file |
| `core.js`, `style.css` | Shared code and design |

## 1. Unzip

In the **Files** app, tap the zip once. It makes a folder with all the files inside.

## 2. Supabase: create the database

1. Open supabase.com in Safari, sign in, and tap **New project**. Name it `rsvp`, pick a strong database password (save it), and choose a region near Kuwait, such as Frankfurt. Wait a minute while it sets up.
2. Open `setup.txt` in the Files app, select all and copy. Your admin email is already in it.
3. In Supabase, open **SQL Editor**, tap **New query**, paste, and tap **Run**. You should see "Setup finished".
4. Open **Project Settings** → **API** (or **Data API**) and keep that page open. You need the **Project URL** and the **anon public** key next.

## 3. GitHub: put the site online

1. Open github.com in Safari (desktop view helps: tap **aA** → **Request Desktop Website**).
2. Tap **New repository**, name it `rsvp`, set it to **Public**, and tap **Create repository**.
3. Tap **uploading an existing file**, choose all the files from the unzipped folder, and tap **Commit changes**.
4. Open **Settings** → **Pages**. Under **Branch**, pick `main` and `/ (root)`, then **Save**. After a minute it shows your address, like `https://yourname.github.io/rsvp`.

## 4. Connect the two

1. In GitHub, tap `config.js`, then the pencil icon to edit.
2. Paste the **Project URL** into `SUPABASE_URL`, the **anon public** key into `SUPABASE_ANON_KEY`, and your GitHub Pages address into `SITE_URL` (no slash at the end).
3. Tap **Commit changes**. The site updates within a couple of minutes.

The anon key is meant to be public, so it's safe in these files. Never paste the **service_role** key anywhere.

## 5. Turn on email login

1. In Supabase, open **Authentication** → **URL Configuration**.
2. Set **Site URL** to your GitHub Pages address.
3. Under **Redirect URLs**, add your address followed by `/**`, for example `https://yourname.github.io/rsvp/**`.
4. Open **Authentication** → **Emails** → **Magic Link**, and add this line to the template so the email includes a 6-digit code:
   `Your code: {{ .Token }}`

## 6. Log in

Open `https://yourname.github.io/rsvp/admin.html`, type your email, and enter the code from the email. You're the admin straight away, because your email is already in `setup.txt`.

## 7. Ghala's shower

`setup.txt` already created it. In **admin.html**:

1. Tap the event, add the venue and Google Maps link, and tap **حفظ**.
2. Upload the card under **تصميم الدعوة**.
3. Upload your guest list (Excel: name, number, number of invites).
4. Add yourself as a test guest, tap **بدء الإرسال**, and send the first one to yourself to check it.

Replies show up in **host.html**.

## Good to know

- Supabase's built-in email login is for testing and sends only a few emails per hour. That's fine while it's just you and Sama logging in.
- To add another admin later (for example Sama), add their email to the list at the top of `setup.txt` and run it again. Your data stays.
