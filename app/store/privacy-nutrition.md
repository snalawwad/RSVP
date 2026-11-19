# App Privacy answers (App Store Connect → App Privacy)

These match `app.json` → `ios.privacyManifests` and the privacy policy (`privacy.html`).

**Does this app collect data?** Yes.

**Tracking:** No. The app has no ads, no analytics SDK and no data broker. `NSPrivacyTracking` is false and there are no tracking domains.

| Data type (Apple's name) | Collected | Linked to the user | Used for tracking | Purpose | Where it comes from |
|---|---|---|---|---|---|
| Contact Info → Name | Yes | Yes | No | App Functionality | The account holder types it on Create account; hosts type their guests' names |
| Contact Info → Phone Number | Yes | Yes | No | App Functionality | The login (phone + WhatsApp code), and guest numbers the host adds |
| Contact Info → Email Address | Yes | Yes | No | App Functionality | The login (email code), or an optional contact email |
| Contacts | Yes | Yes | No | App Functionality | The guest list a host adds or pastes (names and phone numbers). The app does not read the phone's address book. |
| User Content → Other User Content | Yes | Yes | No | App Functionality | A guest's reply and optional message to the hosts |

**Not collected:** location, health, financial info, payment info (there are no purchases), browsing or search history, identifiers for advertising, usage data, diagnostics, photos or videos.

**Camera:** used only on the door screen to scan a guest's door pass QR code. The picture is read on the phone and never stored or sent; only the scanned pass key is looked up. Camera access is therefore not "collected data". The permission text says so in English and Arabic (`locales/*.json`).

**Calendar:** write-only, and only when a guest taps "Add to calendar". Nothing is read from the calendar.

**Account deletion:** Account → Delete account (the `delete-account` function removes the login, the person's access to every event and any event they host alone). Required by guideline 5.1.1(v).

**Required-reason APIs** (privacy manifest, `NSPrivacyAccessedAPITypes`): UserDefaults `CA92.1`, file timestamp `C617.1` `0A2A.1` `3B52.1`, system boot time `35F9.1`, disk space `E174.1` `85F4.1` (used by React Native, Expo and the on-device storage). Expo modules ship their own manifests too; if Apple's email after the first upload lists another reason, add it here and in `app.json`.
