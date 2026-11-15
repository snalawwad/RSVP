// One definition of every count, the same as host.html and door.html.
// guest = one invitation (a row); person = one head (seats / confirmed_count / checked_in_count).
import type { DoorGuest, Guest } from './api';

/** Each guest is 1 person plus 0..5 extras. */
export const MAX_EXTRAS = 5;
export const MAX_PEOPLE = 1 + MAX_EXTRAS;
export const clampSeats = (n: number | string) => Math.max(1, Math.min(MAX_PEOPLE, parseInt(String(n), 10) || 1));

type Countable = Pick<Guest, 'status' | 'seats'> & { confirmed_count?: number | null; checked_in_count?: number | null; checked_in_at?: string | null };

/** People coming on a yes (confirmed count, else the invitation's size). 0 otherwise. */
export const peopleComing = (g: Countable) => (g.status === 'yes' ? g.confirmed_count || g.seats || 1 : 0);
/** People the door may let in on this invitation now (yes → confirmed, no reply → all seats, no → 0). */
export const allowed = (g: Countable) => (g.status === 'yes' ? g.confirmed_count || g.seats : g.status === 'pending' ? g.seats : 0);
/** People still to come in on this invitation. */
export const leftOf = (g: Countable) => Math.max(0, allowed(g) - (g.checked_in_count || 0));
/** People in already (the old schema has no count: then the whole invitation). */
export const arrivedOf = (g: Countable) => (g.checked_in_at ? g.checked_in_count || g.seats || 1 : g.checked_in_count || 0);

/** Someone let in at the door who wasn't on the list: no number, source 'door' / side 'Door'. */
export const atDoor = (g: Pick<Guest, 'source' | 'phone' | 'side'>) => g.source === 'door' || (!g.phone && g.side === 'Door');
/** The guest's side for display (the reserved 'Door' side is not a side). */
export const sideOf = (g: Pick<Guest, 'source' | 'phone' | 'side'>) => (atDoor(g) && g.side === 'Door' ? null : g.side);
/** Has a number, invitation not sent, no reply. */
export const isUnsent = (g: Pick<Guest, 'phone' | 'sent_at' | 'status'>) => !!g.phone && !g.sent_at && g.status === 'pending';

export const sumSeats = (list: Countable[]) => list.reduce((a, g) => a + (g.seats || 1), 0);
export const sumPeople = (list: Countable[]) => list.reduce((a, g) => a + peopleComing(g), 0);

/** Home / Guests numbers (host.html stats()). */
export function stats(list: Guest[]) {
  const yes = list.filter((g) => g.status === 'yes'), no = list.filter((g) => g.status === 'no'), pend = list.filter((g) => g.status === 'pending');
  return { yes, no, pend, unsent: list.filter(isUnsent), toRemind: pend.filter((g) => g.phone && g.sent_at), people: sumPeople(yes), invited: sumSeats(list) };
}

/** Door meter: people in, and people expected (anyone who came in counts as expected too). */
export function doorMeter(list: DoorGuest[]) {
  const arrived = list.reduce((a, g) => a + (g.checked_in_count || 0), 0);
  const expected = list.reduce((a, g) => a + Math.max(peopleComing(g), g.checked_in_count || 0), 0);
  const noReply = list.filter((g) => g.status === 'pending').length;
  return { arrived, expected, noReply, pct: expected ? Math.min(100, (arrived / expected) * 100) : 0 };
}
