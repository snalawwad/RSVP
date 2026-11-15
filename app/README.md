# Host app (iOS and Android)

Expo (React Native) app for hosts, with door mode inside it. Guest pages and admin stay on the web.

- Expo SDK 58, Expo Router (screens in `src/app/`)
- Arabic and English, right to left for Arabic (`src/i18n/strings.ts`)
- Pastel design system tokens (`src/theme/tokens.ts`), same names as the design system
- Same Supabase project and access rules as the web app (`src/lib/supabase.ts`)

## Screens so far

| Screen | Code in the designs | File |
| --- | --- | --- |
| Log in by email code | S1, S2 | `src/app/sign-in.tsx` |
| Your events / no events yet | S3 | `src/app/(app)/index.tsx` |
| Event home: counts of people, invitations used | H1 (first version) | `src/app/(app)/event/[id].tsx` |
| Door check-in by name, no QR | D1 | `src/app/(app)/door/[id].tsx` |
| Settings: language, help, log out | – | `src/app/(app)/settings.tsx` |
| Delete account | – | `src/app/(app)/delete-account.tsx` |

Phase 2 builds the rest from the Figma flows (S4–S9, H2–H12, D2–D3).

## Run it

Node is installed at `~/.local/node` (added to your shell).

```bash
cd app && npm install && npx expo start
```

Press `w` for a web preview, or scan the code with Expo Go on a phone. Arabic direction switching needs a development build (not Expo Go) to restart the app; on web it switches straight away.

Checks before calling anything done:

```bash
npx tsc --noEmit && npx expo-doctor
```

## Settings

`app/.env` holds public values only (Supabase URL and publishable key, site URL, support WhatsApp). For testing against the test project, put its values in `app/.env.local`, which git ignores. Never put the Supabase secret or service key in the app.

## Before TestFlight and the stores

- Brand name and icon: `app.json` still says `[Brand] Host` and `com.CHANGEME.host`.
- Apple Developer account (US$99 a year) and Google Play developer account (US$25 once). Ask Sara before paying.
- Expo account for EAS builds (free plan is enough to start).
- Privacy policy URL: `/privacy.html`; support URL: `/support.html`; account deletion URL for Google Play: `/delete-account.html`.
