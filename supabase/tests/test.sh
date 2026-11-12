#!/bin/sh
# Start a throwaway Postgres in a temp folder, run every file in supabase/migrations, run the checks, stop it.
set -e
cd "$(dirname "$0")"
B=node_modules/@embedded-postgres/darwin-arm64/native/bin
chmod +x "$B"/* 2>/dev/null || true
D=$(mktemp -d)
"$B/initdb" -D "$D" -U postgres --auth=trust -E UTF8 >/dev/null
"$B/pg_ctl" -D "$D" -o "-p 54329 -k /tmp" -l "$D/log.txt" -w start >/dev/null
trap '"$B/pg_ctl" -D "$D" -m fast stop >/dev/null; rm -rf "$D"' EXIT
node run.js
