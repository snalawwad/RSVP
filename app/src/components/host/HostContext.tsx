// The host dashboard's shared state (host.html's page-level variables): the event, its guests, the door's
// requests, the filters, the one-by-one send queue and the add-guest sheet. One provider per event, around
// the four tabs (Home · Guests · Invite · Arrivals), so every tab counts the same list the same way.
import { router, type Href } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useToast, useUndoBand } from '../Feedback';
import { strings } from '../../i18n/strings';
import {
  decideRequest, listGuests, listRequests, loadHostHome, markSent as apiMarkSent, mySide as apiMySide, subscribeGuests, why,
  type DoorRequest, type EventRow, type Guest, type MemberRow,
} from '../../lib/api';
import { cohostGuests, eventRequests, myEvents } from '../../lib/api7';
import type { HostRequest, MyEvent } from '../../lib/types7';
import { daysTo, kwDay } from '../../lib/format';
import { atDoor, isUnsent, peopleComing, sideOf, stats, sumPeople, sumSeats } from '../../lib/guests';
import { haptics } from '../../lib/haptics';
import { fillTemplate, templateFor } from '../../lib/links';
import { KEYS, kv } from '../../lib/storage';
import { countWordHost, type Lang } from '../../lib/words';
import { useApp } from '../../providers/AppProvider';
import { scriptOf } from '../../theme/tokens';

export type Tab = 'home' | 'guests' | 'invite' | 'arrivals';
export type Filter = 'all' | 'yes' | 'pending' | 'no';
export type QueueMode = 'send' | 'remind' | 'update';
export type Queue = { mode: QueueMode; ids: string[]; i: number; done: Set<string>; skipped: Set<string>; asking: boolean; answered: boolean };
type Status = 'loading' | 'ok' | 'error' | 'door' | 'none' | 'missing' | 'draft';

/** a co-host's list has no arrival times: this stands in for "came" (times are hidden for co-hosts) */
export const COHOST_IN = '1970-01-01T00:00:00.000Z';

export const isAr = (s: string | null | undefined) => scriptOf(s || '') === 'ar';
const clip = (s: string, n = 22) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; };

type HostCtx = {
  id: string; status: Status; retry: () => void;
  ev: EventRow | null; setEv: (e: EventRow) => void; evName: string; evLang: Lang;
  guests: Guest[]; guestsLoaded: boolean; members: MemberRow[]; admin: boolean; v2: boolean; mySide: string | null; live: boolean;
  /** this event from my_events_v2 (role, status, package, door) or null before 0007 */
  me: MyEvent | null;
  /** a co-host: sees names, people and replies only (cohost_guests_v2), changes nothing */
  cohost: boolean;
  reload: () => Promise<void>; loadReqs: () => Promise<void>;
  // filters (Guests)
  filter: Filter; setFilter: (f: Filter) => void; side: string; setSide: (s: string) => void; query: string; setQuery: (q: string) => void;
  sides: string[]; pool: Guest[];
  // home extras
  newSince: number; isFresh: (id: string) => boolean;
  // counts
  cw: (n: number, k?: 'person' | 'guest') => string;
  nameParts: (list: Guest[], max?: number) => { names: string[]; more: string };
  // reminders (remembered on this phone, like the web)
  remDays: (gid: string) => number | null; setReminded: (gid: string) => void; remindList: (list: Guest[]) => Guest[];
  // door requests
  reqs: DoorRequest[]; openReqs: DoorRequest[]; reqName: (r: DoorRequest) => string;
  approve: (id: string) => Promise<boolean>; turnDown: (id: string) => void; busyReq: string | null;
  // what the host asked our team for (changes, designs): a draft to approve shows on Your invite (Figma 24p)
  asks: HostRequest[] | null; loadAsks: () => Promise<void>;
  // send one by one
  queue: Queue | null; setQueue: (q: Queue | null) => void; startQueue: (mode: QueueMode, ids: string[]) => void; msgFor: (mode: QueueMode, g: Guest) => string;
  markSent: (gid: string) => Promise<boolean>;
  // add guests
  addSheet: null | { many: boolean }; openAdd: (many: boolean) => void; closeAdd: () => void;
  // navigation
  go: (tab: Tab) => void;
  selfIds: React.MutableRefObject<Set<string>>; markFresh: (id: string) => void;
};

const Ctx = createContext<HostCtx | null>(null);
export function useHost() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useHost must be used inside HostProvider');
  return v;
}

/** The path of a tab of this event. */
export const tabHref = (id: string, tab: Tab) => (tab === 'home' ? `/event/${id}` : `/event/${id}/${tab}`) as Href;

export function HostProvider({ id, children }: { id: string; children: ReactNode }) {
  const { email, t, lang } = useApp();
  const toast = useToast();
  const undoBand = useUndoBand();
  const [status, setStatus] = useState<Status>('loading');
  const [boot, setBoot] = useState(0);
  const [ev, setEvState] = useState<EventRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [admin, setAdmin] = useState(false);
  const [v2, setV2] = useState(false);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [guestsLoaded, setGuestsLoaded] = useState(false);
  const [reqs, setReqs] = useState<DoorRequest[]>([]);
  const [asks, setAsks] = useState<HostRequest[] | null>(null);
  const [live, setLive] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [side, setSide] = useState('all');
  const [query, setQuery] = useState('');
  const [newSince, setNewSince] = useState(0);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [addSheet, setAddSheet] = useState<null | { many: boolean }>(null);
  const [busyReq, setBusyReq] = useState<string | null>(null);
  const [me, setMe] = useState<MyEvent | null>(null);
  const cohostRef = useRef(false);
  const [cohost, setCohost] = useState(false);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const prev = useRef<Map<string, { s: string; c: number; a: boolean }> | null>(null);
  const fresh = useRef(new Map<string, number>());
  const selfIds = useRef(new Set<string>());
  const doorOk = useRef(new Map<string, number>());
  const rejecting = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; band: { close: () => void } }>());
  const committing = useRef(new Set<string>());
  const tRef = useRef(t);
  const evRef = useRef(ev);
  const guestsRef = useRef(guests);
  const v2Ref = useRef(v2);
  useEffect(() => { tRef.current = t; evRef.current = ev; guestsRef.current = guests; v2Ref.current = v2; });
  // requests turned down on this phone but not sent yet (Undo still possible) or on their way
  const [held, setHeld] = useState<string[]>([]);
  const syncHeld = useCallback(() => setHeld([...rejecting.current.keys(), ...committing.current]), []);
  const msTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cw = useCallback((n: number, k: 'person' | 'guest' = 'person') => countWordHost(n, k, lang), [lang]);

  // ---------- one-time celebrations per event (remembered on this phone) ----------
  const milestones = useCallback((list: Guest[]) => {
    const e = evRef.current; if (!list.length || !e) return;
    const key = KEYS.hostMilestones(id), raw = kv.get(key);
    let seen: string[] = []; try { seen = JSON.parse(raw || '[]'); } catch { /* ignore */ }
    const yesP = sumPeople(list.filter((g) => g.status === 'yes')), inv = sumSeats(list);
    const reached: string[] = [];
    if (list.some((g) => g.status === 'yes')) reached.push('first');
    if (inv && yesP * 2 >= inv) reached.push('half');
    if (!list.some((g) => g.status === 'pending')) reached.push('all');
    const d = daysTo(e.starts_at);
    if (list.some((g) => g.checked_in_at) && d != null && d <= 0) reached.push('arrive');
    // first open on this phone: remember what's already true, celebrate only what happens from now on
    if (raw === null) { kv.setJSON(key, reached); return; }
    const nw = reached.filter((k) => !seen.includes(k)); if (!nw.length) return;
    kv.setJSON(key, [...new Set([...seen, ...reached])]);
    const top = ['arrive', 'all', 'half', 'first'].find((k) => nw.includes(k)) as string;
    const T = tRef.current.host;
    const M: Record<string, string> = { first: T.msFirst, half: T.msHalf, all: T.msAll(yesP), arrive: T.msArr };
    if (msTimer.current) clearTimeout(msTimer.current);
    msTimer.current = setTimeout(() => { toast(M[top]); haptics.success(); }, 700);
  }, [id, toast]);

  // ---------- what changed since last time (someone else's change: a toast) ----------
  const diff = useCallback((list: Guest[]) => {
    const now = new Map(list.map((g) => [g.id, { s: g.status, c: g.checked_in_count || 0, a: !!g.checked_in_at }]));
    const T = tRef.current.host;
    if (prev.current) {
      let msg: string | null = null;
      for (const g of list) {
        if (selfIds.current.has(g.id)) continue;
        const p = prev.current.get(g.id), n = now.get(g.id)!;
        // the row the door makes for someone this phone just let in: the 'approved' toast already said it
        if (!p && atDoor(g) && doorOk.current.has(g.name) && Date.now() - (doorOk.current.get(g.name) || 0) < 60000) { doorOk.current.delete(g.name); continue; }
        if (n.a && (!p || !p.a || n.c > p.c)) { fresh.current.set(g.id, Date.now()); msg = msg || T.jIn(g.name); continue; }
        if ((!p && n.s !== 'pending') || (p && p.s !== n.s)) {
          if (n.s === 'yes') { fresh.current.set(g.id, Date.now()); msg = T.jYes(g.name, peopleComing(g)); }
          else if (n.s === 'no') { fresh.current.set(g.id, Date.now()); msg = msg || T.jNo(g.name); }
        }
      }
      if (msg) { toast(msg); haptics.tap(); }
    }
    selfIds.current.clear();
    prev.current = now;
  }, [toast]);

  const reload = useCallback(async () => {
    if (!evRef.current) return;
    let list: Guest[];
    if (cohostRef.current) {
      // never a phone or a link: sent_at is a placeholder so nobody shows as "not sent yet"
      const r = await cohostGuests(id);
      if (r.error) { toast(tRef.current.host.loadErrG); return; }
      list = (r.data ?? []).map((g) => ({ ...g, event_id: id, phone: null, token: '', decline_reason: null, responded_at: g.responded_at ?? null, sent_at: 'cohost',
        checked_in_at: g.checked_in_count ? COHOST_IN : null, created_at: '', source: 'list' }));
    } else {
      const { data, error } = await listGuests(id);
      if (error) { toast(tRef.current.host.loadErrG); return; }
      list = data ?? [];
    }
    if (!prev.current) {
      const k = KEYS.hostSeen(id), last = +(kv.get(k) || 0) || 0;
      setNewSince(last ? list.filter((g) => g.responded_at && g.status !== 'pending' && !atDoor(g) && new Date(g.responded_at).getTime() > last).length : 0);
      kv.set(k, String(Date.now()));
    }
    diff(list);
    guestsRef.current = list;   // a queue started right after this sees the new guest
    setGuests(list); setGuestsLoaded(true);
    milestones(list);
  }, [id, diff, milestones, toast]);

  const loadReqs = useCallback(async () => {
    if (!v2Ref.current || !evRef.current || cohostRef.current) return;   // no door requests on the old schema or for a co-host
    const { data, error } = await listRequests(id);
    if (error) return;
    setReqs(data ?? []);
  }, [id]);

  // the main host's requests to our team (event_requests_v2 is for hosts only: never a co-host)
  const loadAsks = useCallback(async () => {
    if (!evRef.current || cohostRef.current) return;
    const { data, error } = await eventRequests(id);
    if (!error) setAsks(data ?? []);
  }, [id]);

  // ---------- boot: who am I, which events, is this one mine ----------
  useEffect(() => {
    let off = false;
    (async () => {
      const [h, m7] = await Promise.all([loadHostHome(email), myEvents(email)]);
      if (off) return;
      const mine = m7.data?.find((x) => x.id === id) ?? null;
      setMe(mine);
      if (mine?.status === 'draft') { setStatus('draft'); return; }   // "Not sent yet": nothing to do here
      // a co-host can't read the events or guests rows: the event comes from my_events_v2, the list from cohost_guests_v2
      if (mine?.role === 'cohost' && !h.events.some((x) => x.id === id)) {
        cohostRef.current = true; setCohost(true);
        setAdmin(false); setV2(true); v2Ref.current = true; setMembers([]);
        const e: EventRow = { id, title: mine.title, headline: mine.headline ?? null, starts_at: mine.starts_at, ends_at: mine.ends_at ?? null, venue: mine.venue,
          card_image_url: mine.card_image_url ?? null, lang: mine.lang === 'en' ? 'en' : 'ar', invite_limit: mine.invite_limit ?? null, public_code: mine.public_code ?? null };
        evRef.current = e; setEvState(e); prev.current = null; fresh.current = new Map();
        setStatus('ok');
        return;
      }
      cohostRef.current = false; setCohost(false);
      if (h.error) { setStatus('error'); toast(tRef.current.host.loadErrEv); return; }
      setAdmin(h.admin); setV2(h.v2); v2Ref.current = h.v2; setMembers(h.members);
      const e = h.events.find((x) => x.id === id);
      if (!e) { setStatus(mine?.role === 'door' || h.noEvents === 'door' || (h.doorEventIds || []).includes(id) ? 'door' : h.noEvents === 'none' && !mine ? 'none' : 'missing'); return; }
      evRef.current = e; setEvState(e);
      prev.current = null; fresh.current = new Map();
      setStatus('ok');
    })();
    return () => { off = true; };
  }, [id, email, boot, toast]);

  // ---------- live: realtime + every 20 s + coming back to the app ----------
  useEffect(() => {
    if (status !== 'ok') return;
    const first = setTimeout(() => { reload(); loadReqs(); loadAsks(); }, 0);
    const unsub = subscribeGuests(id, () => { reload(); }, (on) => setLive(on));
    const poll = setInterval(() => { reload(); loadReqs(); }, 20000);
    return () => { clearTimeout(first); unsub(); clearInterval(poll); };
  }, [status, id, reload, loadReqs, loadAsks]);

  // ---------- reminders ----------
  const remMap = useCallback((): Record<string, number> => kv.getJSON(KEYS.hostReminded(id), {} as Record<string, number>) || {}, [id]);
  const setReminded = useCallback((gid: string) => { const m = remMap(); m[gid] = Date.now(); kv.setJSON(KEYS.hostReminded(id), m); bump(); }, [id, remMap]);
  const remDays = useCallback((gid: string) => {
    const ts = remMap()[gid]; if (!ts) return null;
    return Math.max(0, Math.round((new Date(kwDay(Date.now())).getTime() - new Date(kwDay(ts)).getTime()) / 864e5));
  }, [remMap]);
  // who to remind now: no reply, invitation sent, not already reminded today (longest-waiting first)
  const remindList = useCallback((list: Guest[]) => {
    const m = remMap();
    return list.filter((g) => g.status === 'pending' && g.phone && g.sent_at && !g.checked_in_at && remDays(g.id) !== 0)
      .sort((a, b) => (m[a.id] || 0) - (m[b.id] || 0));
  }, [remMap, remDays]);

  // ---------- door requests: "Let them in" now; "Turn them down" waits 6 s so it can be undone ----------
  const reqName = useCallback((r: DoorRequest) => (!r.guest_id && (!r.name || /^unlisted guest$/i.test(r.name)) ? ''
    : r.name || guestsRef.current.find((g) => g.id === r.guest_id)?.name || ''), []);
  const openReqs = reqs.filter((r) => r.status === 'pending' && !held.includes(r.id));

  const commitReject = useCallback(async (rid: string) => {
    const x = rejecting.current.get(rid); if (!x) return;
    clearTimeout(x.timer); rejecting.current.delete(rid); x.band.close(); committing.current.add(rid); syncHeld();
    const { error } = await decideRequest(rid, false);
    committing.current.delete(rid);
    if (error) toast(tRef.current.host.cantSave(why(error)));
    else setReqs((list) => list.map((q) => (q.id === rid ? { ...q, status: 'rejected' } : q)));
    syncHeld(); loadReqs();
  }, [loadReqs, toast, syncHeld]);
  const flushRejects = useCallback(() => { [...rejecting.current.keys()].forEach(commitReject); }, [commitReject]);

  const turnDown = useCallback((rid: string) => {
    [...rejecting.current.keys()].forEach(commitReject);   // one undo at a time: an earlier one goes now
    const r = reqs.find((x) => x.id === rid); if (!r) return;
    const T = tRef.current.host;
    const timer = setTimeout(() => commitReject(rid), 6000);
    const band = undoBand({
      text: T.turnedDown(reqName(r) || T.notOnList), ms: 6000, tone: 'no',
      onUndo: () => { const x = rejecting.current.get(rid); if (!x) return; clearTimeout(x.timer); rejecting.current.delete(rid); syncHeld(); },
    });
    rejecting.current.set(rid, { timer, band });
    haptics.tap(); syncHeld();
  }, [reqs, reqName, commitReject, undoBand, syncHeld]);

  const approve = useCallback(async (rid: string) => {
    setBusyReq(rid);
    const { error } = await decideRequest(rid, true);
    setBusyReq(null);
    if (error) { toast(tRef.current.host.cantSave(why(error))); haptics.error(); return false; }
    const r = reqs.find((x) => x.id === rid);
    if (r) { if (r.guest_id) selfIds.current.add(r.guest_id); else doorOk.current.set(r.name, Date.now()); }
    setReqs((list) => list.map((q) => (q.id === rid ? { ...q, status: 'approved' } : q)));
    toast(tRef.current.host.approved); haptics.success();
    loadReqs(); reload();
    return true;
  }, [reqs, loadReqs, reload, toast]);

  // leaving the event sends a waiting "Turn them down" straight away so nothing is lost
  useEffect(() => () => { [...rejecting.current.keys()].forEach((k) => { const x = rejecting.current.get(k); if (x) { clearTimeout(x.timer); x.band.close(); } decideRequest(k, false); }); rejecting.current.clear(); }, []);

  // the app goes to the background (WhatsApp opens, the phone locks): send waiting turn-downs;
  // back again: fresh numbers
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background' || s === 'inactive') flushRejects();
      else if (s === 'active' && evRef.current) { reload(); loadReqs(); loadAsks(); }
    });
    return () => sub.remove();
  }, [flushRejects, reload, loadReqs, loadAsks]);

  // ---------- send one by one ----------
  const evLang: Lang = ev?.lang === 'en' ? 'en' : 'ar';
  const msgFor = useCallback((mode: QueueMode, g: Guest) => {
    const e = evRef.current!; const L: Lang = e.lang === 'en' ? 'en' : 'ar';
    const T = strings[L].host;
    const hasLink = (s: string) => /\{(link|الرابط)\}/.test(s || '');
    if (mode === 'remind') return fillTemplate(T.remindTpl, e, g);
    if (mode === 'update') return fillTemplate(T.updTpl(!!e.venue), e, g);
    // an older saved message without the reply link still sends the link, on its own line at the end
    let tpl = templateFor(e); if (!hasLink(tpl)) tpl = tpl.replace(/\s+$/, '') + (L === 'en' ? '\n{link}' : '\n{الرابط}');
    return fillTemplate(tpl, e, g);
  }, []);
  const startQueue = useCallback((mode: QueueMode, ids: string[]) => {
    setQueue({ mode, ids: ids.filter((x) => guestsRef.current.some((g) => g.id === x)), i: 0, done: new Set(), skipped: new Set(), asking: false, answered: false });
  }, []);
  const markSent = useCallback(async (gid: string) => {
    const now = new Date().toISOString();
    const { error } = await apiMarkSent(gid, now);
    if (error) { toast(tRef.current.host.cantSave(why(error))); return false; }
    selfIds.current.add(gid);
    setGuests((list) => list.map((g) => (g.id === gid ? { ...g, sent_at: now } : g)));
    return true;
  }, [toast]);

  // ---------- derived ----------
  const mySide = ev ? apiMySide(members, id, email, admin) : null;
  const sides = useMemo(() => [...new Set([...guests.map(sideOf), ...members.filter((m) => m.event_id === id).map((m) => m.side)].filter(Boolean) as string[])], [guests, members, id]);
  // a side that's no longer on the list shows everyone
  const sideNow = side !== 'all' && !sides.includes(side) ? 'all' : side;
  const pool = useMemo(() => guests.filter((g) => sideNow === 'all' || g.side === sideNow), [guests, sideNow]);
  const evName = !ev ? '' : lang === 'ar' && ev.headline && isAr(ev.headline) ? ev.headline : ev.title;
  const isFresh = useCallback((gid: string) => { const ts = fresh.current.get(gid); if (!ts) return false; if (Date.now() - ts > 2600) { fresh.current.delete(gid); return false; } return true; }, []);
  const nameParts = useCallback((list: Guest[], max = 3) => ({ names: list.slice(0, max).map((g) => clip(g.name)), more: list.length > max ? t.host.andMore(list.length - max) : '' }), [t]);

  const go = useCallback((tab: Tab) => { router.navigate(tabHref(id, tab)); }, [id]);
  const openAdd = useCallback((many: boolean) => setAddSheet({ many }), []);

  const value: HostCtx = {
    id, status, retry: () => { setStatus('loading'); setBoot((b) => b + 1); },
    ev, setEv: (e) => { evRef.current = e; setEvState(e); }, evName, evLang,
    guests, guestsLoaded, members, admin, v2, mySide, live, reload, loadReqs, me, cohost,
    filter, setFilter, side: sideNow, setSide, query, setQuery, sides, pool,
    newSince, isFresh, cw, nameParts,
    remDays, setReminded, remindList,
    reqs, openReqs, reqName, approve, turnDown, busyReq, asks, loadAsks,
    queue, setQueue, startQueue, msgFor, markSent,
    addSheet, openAdd, closeAdd: () => setAddSheet(null),
    go, selfIds, markFresh: (gid) => { fresh.current.set(gid, Date.now()); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** stats() of a list plus the unsent ones (host.html stats). */
export { stats, isUnsent };
