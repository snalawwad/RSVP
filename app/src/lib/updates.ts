// Updates (Sama's Figma 24o): what changed lately, newest first. Built from what the app can already read:
// replies on the events this login hosts (last 14 days) and invitations sent to this login.
// The unread count (the dot on the Updates tab) is everything newer than the last time Updates was opened.
import { useEffect, useState } from 'react';
import { listGuests, type Guest } from './api';
import { myEvents, myInvites } from './api7';
import { kv } from './storage';
import type { MyEvent, MyInvite } from './types7';

export type Update =
  | { kind: 'reply'; id: string; at: string; eventId: string; eventTitle: string; eventHeadline: string | null; guest: Guest }
  | { kind: 'invite'; id: string; at: string | null; token: string; invite: MyInvite };

const SEEN = 'updates-seen';
const DAY = 86400e3;
let cache: { at: number; email: string; items: Update[] } | null = null;
const listeners = new Set<() => void>();

export const lastSeen = () => Number(kv.get(SEEN) || 0);
export function markSeen() { kv.set(SEEN, String(Date.now())); listeners.forEach((f) => f()); }
export const isNew = (u: Update, seen = lastSeen()) => (u.at ? new Date(u.at).getTime() > seen : seen === 0);

export async function loadUpdates(email: string, force = false): Promise<Update[]> {
  if (!force && cache && cache.email === email && Date.now() - cache.at < 60e3) return cache.items;
  const [ev, inv] = await Promise.all([myEvents(email), myInvites()]);
  const hosted: MyEvent[] = (ev.data ?? []).filter((e) => e.role !== 'door' && e.status !== 'draft'
    && (!e.starts_at || new Date(e.starts_at).getTime() > Date.now() - 7 * DAY));
  const since = Date.now() - 14 * DAY;
  const lists = await Promise.all(hosted.slice(0, 12).map((e) => listGuests(e.id).then((r) => ({ e, g: r.data ?? [] }))));
  const items: Update[] = [];
  for (const { e, g } of lists) {
    for (const x of g) {
      if (!x.responded_at || x.status === 'pending' || new Date(x.responded_at).getTime() < since) continue;
      items.push({ kind: 'reply', id: `r-${x.id}-${x.status}`, at: x.responded_at, eventId: e.id, eventTitle: e.title, eventHeadline: e.headline ?? null, guest: x });
    }
  }
  for (const i of inv.data ?? []) {
    if (i.past) continue;
    items.push({ kind: 'invite', id: `i-${i.token}`, at: i.responded_at && i.status !== 'pending' ? null : null, token: i.token, invite: i });
  }
  items.sort((a, b) => (b.at ? new Date(b.at).getTime() : 0) - (a.at ? new Date(a.at).getTime() : 0));
  cache = { at: Date.now(), email, items: items.slice(0, 60) };
  listeners.forEach((f) => f());
  return cache.items;
}

/** How many updates are new since Updates was last opened (the badge on the tab). */
export function useUnreadUpdates(email: string) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const count = () => { if (alive && cache) { const s = lastSeen(); setN(cache.items.filter((u) => u.kind === 'reply' && isNew(u, s)).length); } };
    listeners.add(count);
    if (email) loadUpdates(email).then(count).catch(() => {});
    return () => { alive = false; listeners.delete(count); };
  }, [email]);
  return n;
}
