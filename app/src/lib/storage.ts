// Small key/value store on this phone. Native: expo-sqlite's localStorage (installed below);
// web: the browser's localStorage. Every read and write is wrapped: storage can be missing or full.
import 'expo-sqlite/localStorage/install';

export const kv = {
  get(key: string): string | null {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  },
  set(key: string, value: string) {
    try { globalThis.localStorage?.setItem(key, value); } catch { /* ignore */ }
  },
  remove(key: string) {
    try { globalThis.localStorage?.removeItem(key); } catch { /* ignore */ }
  },
  getJSON<T>(key: string, fallback: T): T {
    const raw = kv.get(key);
    if (raw == null) return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  },
  setJSON(key: string, value: unknown) { kv.set(key, JSON.stringify(value)); },
};

// Keys shared with the web pages where it makes sense (same names as host.html / door.html).
export const KEYS = {
  lang: 'app-lang',
  theme: 'ui-theme',
  hostTab: (eventId: string) => `host-tab-${eventId}`,
  hostSeen: (eventId: string) => `host-seen-${eventId}`,
  hostReminded: (eventId: string) => `host-rem-${eventId}`,
  hostMilestones: (eventId: string) => `host-ms-${eventId}`,
  doorEvent: 'door-ev',
  /** name (and email) typed on Create account, saved to the profile once logged in */
  pendingProfile: 'pending-profile',
  doorRecent: (eventId: string) => `door-recent-${eventId}`,
} as const;
