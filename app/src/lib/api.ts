// Data layer: typed wrappers for the tables and database functions the web host and door pages use.
// Same Supabase project and rules as the web. The v2 functions (migrations/002) are tried first; when one is
// missing the old way is used, exactly like core.js rpc2 / v2Ready and door.html.
// Every call returns { data, error } and never throws. error.code is set when the database answered;
// a dropped connection has no code (netFail).
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type {
  AccountSummary, AuditRow, CheckInResult, DoorGuest, DoorRequest, EventRow, Guest, GuestStatus, MemberRow, UndoResult,
} from './types';

export * from './types';
export * from './types7';

export type ApiError = { message: string; code?: string; details?: string; hint?: string };
export type Res<T> = { data: T | null; error: ApiError | null };

const asErr = (e: unknown): ApiError => {
  if (e && typeof e === 'object' && 'message' in e) {
    const x = e as { message: string; code?: string; details?: string; hint?: string };
    return { message: String(x.message || ''), code: x.code || undefined, details: x.details, hint: x.hint };
  }
  return { message: String(e) };
};
export async function wrap<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<Res<T>> {
  try {
    const r = await p;
    return { data: (r.data as T) ?? null, error: r.error ? asErr(r.error) : null };
  } catch (e) {
    return { data: null, error: asErr(e) };
  }
}

/** The function isn't installed (migration not run yet). */
export const missingFn = (err: ApiError | null | undefined) =>
  !!err && (err.code === 'PGRST202' || err.code === '42883' || /Could not find the function/i.test(err.message || ''));
/** No answer at all (dropped connection). A database answer always has a code. */
export const netFail = (err: ApiError | null | undefined) => !!err && !err.code;
/** A failed save in plain words: 'net' | 'own' | 'perm' | 'other' → t.host.cantSave(kind). */
export function why(err: ApiError | null | undefined): 'net' | 'own' | 'perm' | 'other' {
  const m = String(err?.message || ''), c = String(err?.code || '');
  if (!c && /fetch|network|load failed|abort|timed? ?out|offline/i.test(m)) return 'net';
  if (/own request/i.test(m)) return 'own';
  if (c === '42501' || /not allowed|only the host|permission|denied|row-level/i.test(m)) return 'perm';
  return 'other';
}
/** The package (invite_limit) is full. */
export const overLimit = (err: ApiError | null | undefined) => !!err && /limit/i.test(err.message || '');

// ---------- v2 detection (core.js v2Ready / rpc2) ----------
let v2Probe: Promise<boolean> | null = null;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Are the upgraded functions installed? Probed once (3 tries on a bad connection, then "no" without caching). */
export function v2Ready(): Promise<boolean> {
  if (!v2Probe) v2Probe = (async () => {
    for (let i = 0; i < 3; i++) {
      const r = await wrap(supabase.rpc('get_event_public_v2', { p_code: '-' }));
      if (!netFail(r.error)) return !missingFn(r.error);
      await wait(1200);
    }
    v2Probe = null;
    return false;
  })();
  return v2Probe;
}
/** For tests and sign-out: forget what we learned about the database. */
export function resetProbes() { v2Probe = null; undoProbe = null; passProbe = null; }

/** Try the upgraded function first, fall back to the old one if it isn't installed. v2: true/false, or null on a dropped connection. */
export async function rpc2<T>(name: string, args: Record<string, unknown>, oldName?: string, oldArgs?: Record<string, unknown>): Promise<Res<T> & { v2: boolean | null }> {
  const r = await wrap<T>(supabase.rpc(name, args));
  if (netFail(r.error)) return { ...r, v2: null };
  if (!missingFn(r.error)) { v2Probe = Promise.resolve(true); return { ...r, v2: true }; }
  v2Probe = Promise.resolve(false);
  if (!oldName) return { data: null, error: r.error, v2: false };
  return { ...(await wrap<T>(supabase.rpc(oldName, oldArgs ?? {}))), v2: false };
}

// ---------- who am I ----------
export const isAdmin = async () => (await wrap<boolean>(supabase.rpc('is_admin'))).data === true;
export const canHost = async (eventId: string) => (await wrap<boolean>(supabase.rpc('can_host', { p_event: eventId }))).data === true;

/** Lower-case an email that may be missing (members added by phone have none). */
export const lc = (s: string | null | undefined) => String(s || '').trim().toLowerCase();

/** Events this login can see (RLS decides), soonest first. */
export const listEvents = (columns = '*') =>
  wrap<EventRow[]>(supabase.from('events').select(columns).order('starts_at', { ascending: true }));
export const getEvent = (id: string, columns = '*') => wrap<EventRow>(supabase.from('events').select(columns).eq('id', id).single());
export const listMembers = () => wrap<MemberRow[]>(supabase.from('event_members').select('*'));

/**
 * What the host page does after login (host.html requireLogin callback): admin?, v2?, the events this person
 * hosts (door-only events left out unless admin), members, and noEvents = 'door' | 'none' | null.
 */
export async function loadHostHome(email: string) {
  const me = lc(email);
  const [admin, v2, evs, mem] = await Promise.all([isAdmin(), v2Ready(), listEvents(), listMembers()]);
  if (evs.error) return { error: evs.error, admin, v2, events: [] as EventRow[], members: [] as MemberRow[], noEvents: null as null | 'door' | 'none' };
  const members = mem.data ?? [];
  const mine = members.filter((m) => lc(m.email) === me);
  const doorOnly = new Set(mine.filter((m) => m.role === 'door').map((m) => m.event_id));
  const events = (evs.data ?? []).filter((e) => admin || !doorOnly.has(e.id));
  const noEvents = events.length ? null : doorOnly.size ? 'door' as const : 'none' as const;
  return { error: null, admin, v2, events, members, noEvents, doorEventIds: [...doorOnly] };
}
/** The host's own side on an event (a host who only sees one family's guests), or null. */
export function mySide(members: MemberRow[], eventId: string, email: string, admin: boolean) {
  if (admin) return null;
  const m = members.find((x) => x.event_id === eventId && lc(x.email) === lc(email) && x.role === 'host');
  return m?.side || null;
}

/** What the door page does after login: v2?, can this person open the host pages?, and the events. */
export async function loadDoorHome(email: string) {
  const me = lc(email);
  const [v2, admin, mem, evs] = await Promise.all([v2Ready(), isAdmin(), wrap<Pick<MemberRow, 'role' | 'email'>[]>(supabase.from('event_members').select('role, email')),
    wrap<Pick<EventRow, 'id' | 'title' | 'starts_at'>[]>(supabase.from('events').select('id, title, starts_at').order('starts_at'))]);
  const canHostAny = admin || (mem.data ?? []).some((m) => m.role === 'host' && (!me || String(m.email || '').toLowerCase() === me));
  return { error: evs.error, v2, canHost: canHostAny, events: evs.data ?? [] };
}
/** The event the door opens on: the saved one, else the next one (Kuwait date), else the last. */
export function pickDoorEvent<T extends { id: string; starts_at: string | null }>(events: T[], savedId: string | null) {
  const kwDay = (iso: string | number) => new Date(new Date(iso).getTime() + 3 * 3600e3).toISOString().slice(0, 10);
  const today = kwDay(Date.now());
  return events.find((x) => x.id === savedId) || events.find((x) => x.starts_at && kwDay(x.starts_at) >= today) || events[events.length - 1] || null;
}

// ---------- guests (host) ----------
export const listGuests = (eventId: string) =>
  wrap<Guest[]>(supabase.from('guests').select('*').eq('event_id', eventId).order('created_at'));

export type NewGuest = { event_id: string; name: string; phone: string; seats: number; side?: string | null };
/** Add one guest. error.code '23505' = that number is already on the list; overLimit(error) = package full. */
export const addGuest = (g: NewGuest) => wrap<Guest>(supabase.from('guests').insert(g).select().single());
/** Add many; numbers already on the list are skipped. data = the ids added. */
export const addGuests = (rows: NewGuest[]) =>
  wrap<{ id: string }[]>(supabase.from('guests').upsert(rows, { onConflict: 'event_id,phone', ignoreDuplicates: true }).select('id'));
/** Move a guest to another group (side). */
export const setGuestSide = (id: string, side: string | null) => wrap<null>(supabase.from('guests').update({ side }).eq('id', id));
export const removeGuest = (id: string) => wrap<null>(supabase.from('guests').delete().eq('id', id));
/** The host said "Yes, it's sent". */
export const markSent = (id: string, at = new Date().toISOString()) => wrap<null>(supabase.from('guests').update({ sent_at: at }).eq('id', id));
/** v2: change a reply by hand. count = people coming on a yes. */
export const setReply = (guestId: string, status: GuestStatus, count: number | null) =>
  wrap<Guest>(supabase.rpc('host_set_reply_v2', { p_guest: guestId, p_status: status, p_count: status === 'yes' ? count : null }));
/** v2: people on the invitation = 1 + extras (0..5). */
export const setExtras = (guestId: string, extras: number) => wrap<Guest>(supabase.rpc('host_set_extras_v2', { p_guest: guestId, p_extras: extras }));

// ---------- the event (host) ----------
/** Save only the fields that changed. Returns the saved event. */
export const updateEvent = (eventId: string, patch: Partial<EventRow>) =>
  wrap<EventRow>(supabase.rpc('host_update_event', { p_event: eventId, p: patch }));
/** v2: reply rules. */
export const setRules = (eventId: string, deadline: string | null, allowChanges: boolean, linkEnabled: boolean) =>
  wrap<EventRow>(supabase.rpc('host_set_rules_v2', { p_event: eventId, p_deadline: deadline, p_allow_changes: allowChanges, p_link_enabled: linkEnabled }));
/** v2: the activity log, newest first (door_open_list rows are noise: filter them out). */
export const auditLog = (eventId: string) => wrap<AuditRow[]>(supabase.rpc('audit_log_v2', { p_event: eventId }));

// ---------- door requests ----------
/** v2: door requests, newest first. */
export const listRequests = (eventId: string) => wrap<DoorRequest[]>(supabase.rpc('list_exceptions_v2', { p_event: eventId }));
/** Host: let them in (true) or turn them down (false). Final: the host page waits 6 s (Undo) before a turn-down. */
export const decideRequest = (id: string, approve: boolean) => wrap<DoorRequest>(supabase.rpc('decide_exception_v2', { p_id: id, p_approve: approve }));
/** Door: ask the hosts about someone not on the list (guestId null) or extra people on an invitation. */
export const requestException = (a: { eventId: string; guestId: string | null; name: string; people: number; note?: string | null }) =>
  wrap<DoorRequest>(supabase.rpc('request_exception_v2', { p_event: a.eventId, p_guest: a.guestId, p_name: a.name, p_people: a.people, p_note: a.note ?? null }));

// ---------- door ----------
/**
 * The door list. With v2 it uses door_list_v2; if that's missing it drops to door_list and says so (v2: false).
 * Rows always have checked_in_count (v1: the whole invitation once checked in).
 */
export async function doorList(eventId: string, v2: boolean): Promise<Res<DoorGuest[]> & { v2: boolean }> {
  let r = v2 ? await wrap<DoorGuest[]>(supabase.rpc('door_list_v2', { p_event: eventId })) : null;
  let usedV2 = v2;
  if (!r || (r.error && missingFn(r.error))) { usedV2 = false; r = await wrap<DoorGuest[]>(supabase.rpc('door_list', { p_event: eventId })); }
  const data = r.data ? r.data.map((g) => ({
    ...g, phone: g.phone ?? null, confirmed_count: g.confirmed_count ?? null, decline_reason: g.decline_reason ?? null, side: g.side ?? null,
    checked_in_count: g.checked_in_count ?? (g.checked_in_at ? g.seats : 0), pass_code: g.pass_code ?? null,
  })) : null;
  return { data, error: r.error, v2: usedV2 };
}

/**
 * Check people in. v2: check_in_v2(guest, people); v1: check_in_guest(guest) (the whole invitation).
 * droppedV2 = the v2 function went missing: switch the door to the old way (door.html dropV2) and reload the list.
 * A dropped connection (netFail) may still have saved: reload the list before offering "Retry" (door.html does).
 */
export async function checkIn(guestId: string, people: number, v2: boolean): Promise<Res<CheckInResult> & { droppedV2: boolean }> {
  if (v2) {
    const r = await wrap<CheckInResult>(supabase.rpc('check_in_v2', { p_guest: guestId, p_people: people }));
    if (r.error && missingFn(r.error)) return { ...r, droppedV2: true };
    return { ...r, droppedV2: false };
  }
  return { ...(await wrap<CheckInResult>(supabase.rpc('check_in_guest', { p_guest: guestId }))), droppedV2: false };
}

const ZERO = '00000000-0000-0000-0000-000000000000';
let undoProbe: Promise<boolean | null> | null = null;
/**
 * Is Undo installed (supabase/migrations/0004)? A call for a guest that can't exist changes nothing.
 * true = show Undo · false = hide it (exactly like door.html) · null = couldn't tell (connection); treat as hidden for now and ask again later.
 */
export function probeUndo(v2: boolean): Promise<boolean | null> {
  if (!v2) return Promise.resolve(false);
  if (!undoProbe) undoProbe = (async () => {
    const r = await wrap<UndoResult>(supabase.rpc('undo_check_in_v2', { p_guest: ZERO, p_people: 1 }));
    if (r.error && missingFn(r.error)) return false;
    if (!r.error) return true;
    undoProbe = null;
    return null;
  })();
  return undoProbe;
}
/** Undo this phone's latest check-in of exactly `people` on that guest (within 10 minutes). missing = hide Undo from now on. */
export async function undoCheckIn(guestId: string, people: number): Promise<Res<UndoResult> & { missing: boolean }> {
  const r = await wrap<UndoResult>(supabase.rpc('undo_check_in_v2', { p_guest: guestId, p_people: people }));
  if (r.error && missingFn(r.error)) { undoProbe = Promise.resolve(false); return { ...r, missing: true }; }
  return { ...r, missing: false };
}

let passProbe: Promise<boolean | null> | null = null;
/**
 * Is the door pass scan installed (supabase/migrations/0005, door_pass_lookup_v2)? Asked for an event that can't
 * exist: the database refuses it ("Not allowed") without reading a guest or writing the log.
 * true = show "Scan pass" · false = hide it · null = couldn't tell (connection); hidden for now, asked again later.
 */
export function probePass(v2: boolean): Promise<boolean | null> {
  if (!v2) return Promise.resolve(false);
  if (!passProbe) passProbe = (async () => {
    const r = await wrap<unknown>(supabase.rpc('door_pass_lookup_v2', { p_event: ZERO, p_key: '-' }));
    if (r.error && missingFn(r.error)) return false;
    if (!netFail(r.error)) return true;
    passProbe = null;
    return null;
  })();
  return passProbe;
}
/**
 * A scanned pass: the guest's door_list_v2 row, or null when no guest of this event (on this login's list) has it.
 * key: the pass key or the whole QR link. missing = the function went away: hide "Scan pass" from now on.
 */
export async function passLookup(eventId: string, key: string): Promise<Res<DoorGuest> & { missing: boolean }> {
  const r = await wrap<DoorGuest>(supabase.rpc('door_pass_lookup_v2', { p_event: eventId, p_key: key }));
  if (r.error && missingFn(r.error)) { passProbe = Promise.resolve(false); return { ...r, missing: true }; }
  const g = r.data && typeof r.data === 'object' && 'id' in r.data ? r.data : null;
  return {
    data: g ? { ...g, phone: g.phone ?? null, confirmed_count: g.confirmed_count ?? null, decline_reason: g.decline_reason ?? null, side: g.side ?? null, checked_in_count: g.checked_in_count ?? 0, pass_code: g.pass_code ?? null } : null,
    error: r.error, missing: false,
  };
}

// ---------- live updates ----------
/** Calls onChange when any guest row of the event changes. Returns an unsubscribe. onStatus(true) once live. */
export function subscribeGuests(eventId: string, onChange: () => void, onStatus?: (live: boolean) => void) {
  let ch: RealtimeChannel | null = null;
  try {
    ch = supabase.channel('guests-' + eventId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guests', filter: `event_id=eq.${eventId}` }, () => onChange())
      .subscribe((s) => onStatus?.(s === 'SUBSCRIBED'));
  } catch { onStatus?.(false); }
  return () => { if (ch) supabase.removeChannel(ch).catch(() => {}); };
}

// ---------- account ----------
export const accountSummary = () => wrap<AccountSummary>(supabase.rpc('my_account_summary'));
/** The delete-account Edge Function does the work server side. */
export async function deleteAccount(): Promise<Res<unknown>> {
  try {
    const { data, error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
    return { data, error: error ? asErr(error) : null };
  } catch (e) { return { data: null, error: asErr(e) }; }
}
export const signOut = async () => { resetProbes(); await supabase.auth.signOut(); };
