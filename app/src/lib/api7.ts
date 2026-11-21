// Calls from 0007_self_serve (docs/launch/SPEC.md "Database contract"). Each one has a fallback for a database
// that doesn't have 0007 yet (the live pilot today), so the app keeps working: events come the old way, a guest
// with an email login has no invitations, and the profile is empty.
// The app never calls a payment, package or change-request function (Apple: no purchases in the app).
import { isAdmin, loadHostHome, missingFn, wrap, type Res } from './api';
import { supabase } from './supabase';
import type { EventRow, GuestStatus } from './types';
import type { CohostGuest, InviteView, MyEvent, MyInvite, PackageRow, Profile } from './types7';

type Head = Pick<EventRow, 'id' | 'title' | 'headline' | 'starts_at' | 'ends_at' | 'venue' | 'lang' | 'invite_limit' | 'card_image_url'>;

/**
 * Events this login hosts, co-hosts or works the door for (my_events_v2), soonest first, past last.
 * Before 0007: built the old way (event_members by email), every event 'active'.
 * Admins also get every event they can read, as hosts (they run the pilot from the web admin page).
 */
export async function myEvents(email: string): Promise<Res<MyEvent[]> & { v7: boolean; admin: boolean }> {
  const [r, admin, heads] = await Promise.all([
    wrap<MyEvent[]>(supabase.rpc('my_events_v2')),
    isAdmin(),
    wrap<Head[]>(supabase.from('events').select('id, title, headline, starts_at, ends_at, venue, lang, invite_limit, card_image_url').order('starts_at', { ascending: true })),
  ]);
  const headOf = new Map((heads.data ?? []).map((e) => [e.id, e.headline ?? null]));
  if (!r.error) {
    const list: MyEvent[] = (Array.isArray(r.data) ? r.data : []).map((e) => ({ ...e, headline: headOf.get(e.id) ?? null }));
    if (admin) for (const e of heads.data ?? []) if (!list.some((x) => x.id === e.id)) list.push({ ...e, role: 'host', status: 'active', counts: null });
    return { data: list, error: null, v7: true, admin };
  }
  if (!missingFn(r.error)) return { data: null, error: r.error, v7: true, admin };
  // the old way (the database doesn't have 0007 yet)
  const h = await loadHostHome(email);
  if (h.error) return { data: null, error: h.error, v7: false, admin };
  const hostIds = new Set(h.events.map((e) => e.id));
  const doorIds = new Set('doorEventIds' in h ? h.doorEventIds : []);
  const rows: { e: Head; role: MyEvent['role'] }[] = [
    ...h.events.map((e) => ({ e: e as Head, role: 'host' as const })),
    ...(heads.data ?? []).filter((e) => doorIds.has(e.id) && !hostIds.has(e.id)).map((e) => ({ e, role: 'door' as const })),
  ];
  return {
    data: rows.map(({ e, role }) => ({
      id: e.id, title: e.title, headline: e.headline ?? null, starts_at: e.starts_at, ends_at: e.ends_at ?? null, venue: e.venue, lang: e.lang,
      card_image_url: e.card_image_url, invite_limit: e.invite_limit, role, status: 'active', counts: null,
    })),
    error: null, v7: false, admin,
  };
}

/** Invitations sent to this login's phone number (my_invites_v2). Email logins and the old schema: none. */
export async function myInvites(): Promise<Res<MyInvite[]>> {
  const r = await wrap<MyInvite[]>(supabase.rpc('my_invites_v2'));
  if (r.error && missingFn(r.error)) return { data: [], error: null };
  return { ...r, data: Array.isArray(r.data) ? r.data : r.data ? [] : null };
}

export async function myProfile(): Promise<Res<Profile>> {
  const r = await wrap<Profile>(supabase.rpc('my_profile_v2'));
  if (r.error && missingFn(r.error)) return { data: null, error: null };
  return r;
}
/** Name and an optional contact email. Access always comes from the login itself. */
export const saveProfile = (name: string, email: string | null) => wrap<Profile>(supabase.rpc('save_profile_v2', { p_name: name, p_email: email || null }));

/** A co-host's view of the list: names, people and replies, never phone numbers or links. */
export const cohostGuests = (eventId: string) => wrap<CohostGuest[]>(supabase.rpc('cohost_guests_v2', { p_event: eventId }));

/** The packages (read-only: the app never sells one). Before 0007: none. */
export async function listPackages(): Promise<Res<PackageRow[]>> {
  const r = await wrap<PackageRow[]>(supabase.from('packages').select('code, name_en, name_ar, invite_limit, door_included, design_included'));
  return r.error ? { data: [], error: null } : r;
}

// ---------- the guest's own invitation (their personal link's token) ----------
export const getInvite = (token: string) => wrap<InviteView | null>(supabase.rpc('get_invite_v2', { p_token: token }));
/** Reply. count = people coming on a yes (1..seats). Errors: RSVP_CLOSED, CHANGES_LOCKED, NOT_READY. */
export const respond = (token: string, status: GuestStatus, count: number | null, reason: string | null) =>
  wrap<InviteView>(supabase.rpc('respond_v2', { p_token: token, p_status: status, p_count: status === 'yes' ? count : null, p_reason: status === 'no' ? reason : null }));

/** "Create an event" in the app: makes a draft and a request the team finalises with the host (0008). id = the event. */
export type EventRequest = {
  event: { title: string; event_type?: string; starts_at?: string | null; venue?: string | null; lang: 'ar' | 'en' };
  guests?: number | null; door: boolean; design: 'we_design' | 'own' | 'simple'; contact: string; notes?: string;
};
export const requestEvent = (p: EventRequest) => wrap<string>(supabase.rpc('request_event_v2', { p }));
/** Has this (draft) event got a request from the app waiting? */
export async function hasEventRequest(eventId: string): Promise<boolean> {
  const r = await wrap<{ kind: string; status: string }[]>(supabase.rpc('event_requests_v2', { p_event: eventId }));
  return !r.error && Array.isArray(r.data) && r.data.some((x) => x.kind === 'event' && x.status !== 'cancelled');
}
