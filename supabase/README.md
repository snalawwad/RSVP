# Database files

The live database (Supabase project `hexnxpufurftldpfcukd`) is now kept as files here, so every change is written down and tested before it reaches live events.

| File | What it is |
| --- | --- |
| `migrations/0000_baseline.sql` | What the live database had on 12 Nov 2026, before the MVP upgrade. **Never run on live.** Only for building a test copy. |
| `../migrations/002_mvp_core.sql` | The MVP upgrade (plus-ones, partial arrivals, door requests, activity log). **Already run on live.** Kept in the root `migrations/` folder with its rollback file. |
| `migrations/0003_account_deletion.sql` | Adds account deletion: one new table and two new functions. Changes nothing that exists. **Not on live yet.** |
| `migrations/0004_door_undo.sql` | Adds one function, `undo_check_in_v2`, so the door can undo its own check-in within 10 minutes. Changes no table, column, row or existing function. **Not on live yet** (the door page hides Undo until it is). Remove with `drop function if exists public.undo_check_in_v2(uuid, int);`. |
| `migrations/0005_door_pass.sql` | Door pass with a QR code for every guest. Adds one guest column, `pass_code` (4 digits, shown as SN-1234), and one locked table, `guest_passes`, holding each guest's secret `pass_key` (what the QR carries; row security on, no policies, no grants, so it never reaches host/admin lists, `to_jsonb(guest)` results or realtime). Both are filled for every guest old and new; adds a `pass` object to the guest invite (only when the reply is yes); adds `pass_code` to `door_list_v2` (never the key); adds `door_pass_lookup_v2` for scanning, logged as `pass_scan`. Nothing is removed. **Not on live yet** (the invite hides the pass and the door hides Scan until it is). How to remove it is at the top of the file. After this file, `002_mvp_core.sql` can't be run again until `door_list_v2` is dropped. This ends the old "no QR codes" rule: the comment "(no QR: by name, with a count)" in `002_mvp_core.sql` is now out of date (door check-in is by name, pass code or QR door pass); it is left as it is because files that ran on live are not edited. |
| `functions/delete-account/` | The server function the app calls to delete an account. |
| `tests/` | Runs all the files on a throwaway Postgres on this Mac and checks the rules. Never touches Supabase. |
| `export_live_schema.sql` | Read-only query to export the live structure again if needed. |

## Rules

1. **Only add.** New tables, columns and functions are fine. Never drop, rename or change what the live pages use.
2. **One new numbered file per change**, continuing from the highest number (next is `0006_…sql`). Never edit a file that has already run on live.
3. **Test first:** `npm test` in `supabase/tests`, then run on the test project, then (with Sara's OK) on live.
4. **Nothing on live before 20 Nov 2026** (Ghala's shower) unless it's urgent.

## Test locally (on this Mac)

```bash
cd supabase/tests && npm install && npm test
```

## Set up the free test project (once)

1. In Supabase, create a new project on the **Free** plan (for example `rsvp-test`). It costs nothing.
2. In its **SQL Editor**, run these in order: `supabase/migrations/0000_baseline.sql`, then `migrations/002_mvp_core.sql`, then `supabase/migrations/0003_account_deletion.sql`.
3. In **Authentication → URL Configuration**, set the same Site URL and redirects as live, and add `Your code: {{ .Token }}` to the Magic Link email template.
4. Deploy the server function: **Edge Functions → Deploy a new function → Via Editor**, name it `delete-account`, and paste `functions/delete-account/index.ts`. (Or with the Supabase CLI: `supabase functions deploy delete-account --project-ref <test-ref>`.)
5. Point the app at it: create `app/.env.local` with the test project's URL and publishable key (see `app/.env`).

## Going live with 0003 (after testing, with Sara's OK)

Run `0003_account_deletion.sql` in the live SQL editor and deploy `delete-account` to the live project. It only adds, so the guest, host, admin and door pages keep working.
