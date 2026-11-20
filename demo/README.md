# Sina demo (sample data, no login)

- App: https://snalawwad.github.io/RSVP/demo/app/
- Website (host flow, invite, door, admin): https://snalawwad.github.io/RSVP/demo/web/host.html

Everything runs in the visitor's own browser: `demo-backend.js` starts a small Postgres (PGlite)
from `demo-db.tar.gz` (the repo's database files + sample events) and answers the app's server
calls. Nobody is asked to log in, payments are the test kind, and nothing reaches the real database.
Each browser keeps its own copy; "Demo · start over" (or `?reset=1`) puts the sample data back.

Rebuild after changes (from the session test rig):
1. `demo-db.tar.gz`: run `build_demo_db.mjs` (REPO=~/RSVP) and copy the output here.
2. `app/`: `npx expo export --platform web` in `app/` with `experiments.baseUrl` `/RSVP/demo/app` and
   `EXPO_PUBLIC_SUPABASE_URL=https://mock.supabase.test`, then add
   `<script src="/RSVP/demo/demo-backend.js"></script>` first in `<head>` and copy `index.html` to `/404.html`.
3. `web/`: copy the site pages, set `config.js` `SUPABASE_URL` to `https://mock.supabase.test` and
   `SITE_URL` to `…/demo/web`, and add the same script tag first in every page's `<head>`.
