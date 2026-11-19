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
| Door check-in by name, pass code or QR door pass | D1 | `src/app/(app)/door/[id].tsx` |
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

## Launch build (Sama's Figma)

- Log in: 01 Welcome, 02 Create account, 02b Log in, 03 Enter the code (`src/app/sign-in.tsx`). Phone + WhatsApp code when
  `EXPO_PUBLIC_LOGIN_PHONE=true` (only once the WhatsApp code hook is on, see WHATSAPP_SETUP.md), else email code.
- One home for everyone (`src/app/(app)/index.tsx`): events from `my_events_v2`, invitations from `my_invites_v2`.
- Guest: invite (`invite/[token]`), door pass QR (`pass/[token]`), change reply (`reply/[token]`), add to calendar (expo-calendar).
- Host: overview, guests, invite, arrivals (`event/[id]`), read-only package (`package/[id]`). Co-hosts get the reduced view.
- Account (`settings.tsx`): name, language, colours, help, privacy, terms, log out, delete account.
- The app never sells anything and never points to the website to pay (Apple). No create event, no package choice, no paid changes.

## Before TestFlight and the stores

Only Sara can do these (no Apple account yet):

1. Enrol in the Apple Developer Program (US$99 a year) as Sina.
2. Pick the real bundle id (`app.json` has the placeholder `com.sina.app` for iOS and Android) and register it.
3. Create the app record in App Store Connect (name Sina, Arabic name سنة, primary language English, Arabic localisation).
4. `npx eas-cli@latest login`, then `npx eas-cli@latest init` (links the project), then fill `eas.json` → `submit.production.ios`
   (Apple ID, App Store Connect app id, team id).
5. Create the two review accounts and the demo event (`store/review-notes.md`).
6. Fill App Privacy from `store/privacy-nutrition.md`, the listing from `store/listing.en.md` / `store/listing.ar.md`, and upload
   `store/screenshots/6.9` and `store/screenshots/6.5`.
7. `npx eas-cli@latest build --platform ios --profile production`, then `npx eas-cli@latest submit --platform ios`.

Icons: `assets/icon.png` (1024, plum arch on cream, no transparency), Android adaptive layers and the splash are drawn from
Sama's arch mark (`assets/arch-mark.svg`, Figma Brand/Arch mark 4:148). Privacy policy `/privacy.html`, support `/support.html`,
terms `/terms.html`, account deletion for Google Play `/delete-account.html`.
