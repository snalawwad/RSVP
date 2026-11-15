// Door check-in (door.html, Nov 2026): find a guest by name or phone, check in the right number of people,
// undo a slip, and ask the hosts about extra or unlisted guests. No QR codes.
// Same database functions as the web door: door_list_v2 / check_in_v2 / undo_check_in_v2 / request_exception_v2 /
// list_exceptions_v2, with door_list / check_in_guest when the upgrade isn't installed (and no Undo without 0004).
import { activateKeepAwakeAsync, deactivateKeepAwake, isAvailableAsync } from 'expo-keep-awake';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useReducer, useRef, type ComponentRef, type ReactNode } from 'react';
import { AccessibilityInfo, AppState, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Busy, Button, EmptyState, Icon, Row, RowList, Sheet, Txt, useToast } from '../../../components';
import { AskSheet, type AskState } from '../../../components/door/AskSheet';
import {
  ANS_SHOWN, BAND_MS, MAX_ASK, UNDO_MS, allowed, curN, digitsOf, isDigits, leftOf, orderHits, stateOf,
} from '../../../components/door/logic';
import { AnswerCard, Cap, DoorBand, DoorMeter, GuestCard, LivePill, Notice, QuietLink, RecentRow, ReqTag, SearchRow, Sentence, doorWebBack, type NoticeBtn } from '../../../components/door/parts';
import * as api from '../../../lib/api';
import type { CheckInResult, DoorGuest, DoorRequest } from '../../../lib/api';
import { dayMon, daysTo, fmtTime } from '../../../lib/format';
import { doorMeter } from '../../../lib/guests';
import { haptics } from '../../../lib/haptics';
import { KEYS, kv } from '../../../lib/storage';
import { countWord } from '../../../lib/words';
import { useApp } from '../../../providers/AppProvider';
import { bodyFont, gutter, radius, scriptOf, space, toneColors } from '../../../theme/tokens';

/** a "Just arrived" row. by = the email that checked them in on this phone: the list is kept on the phone
 *  (so it survives the app closing mid-evening) but only that login sees it, and only for RECENT_MS. */
type Recent = { name: string; n: number; at: number; id: string; q: string; u: boolean; by: string };
const RECENT_MS = 12 * 3600e3;
const who = (email: string | null | undefined) => String(email || '').trim().toLowerCase();
/** this login's own rows from the last 12 hours; anything else stored under the key is dropped */
const ownRecent = (raw: unknown, email: string | null | undefined): Recent[] => {
  const me = who(email), now = Date.now();
  return (Array.isArray(raw) ? raw : []).filter((r): r is Recent =>
    !!r && typeof r === 'object' && !!me && (r as Recent).by === me && typeof (r as Recent).at === 'number' && now - (r as Recent).at < RECENT_MS && (r as Recent).at <= now + 60000);
};
type Info = { id: string; name: string; n: number; left: number; status: string; at: number; undo: boolean; q?: string };
type Band = { kind: 'ci'; info: Info } | { kind: 'info'; tone: 'ok' | 'wait' | 'no'; text: string; sub?: string; tpl?: (x: string) => string; name?: string };
type Answer = { id: string; status: DoorRequest['status']; name: string; people: number };
type NoticeS = { tone: 'ok' | 'wait' | 'no'; title: string; name: string; sub?: string; buttons: NoticeBtn[] };
type Ev = { id: string; title: string; starts_at: string | null };

// quiet milestones (half in, everyone in): once per event per app session, like the web's sessionStorage
const milestones = new Set<string>();

export default function Door() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, c, email, reduceMotion } = useApp();
  const T = t.door;
  const toast = useToast();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const reqsY = useRef(0);
  const alive = useRef(true);

  // One mutable store, like door.html's module variables; redraw() paints it.
  const S = useRef({
    phase: 'loading' as 'loading' | 'ready' | 'none',
    events: [] as Ev[], ev: null as Ev | null, canHost: false, v2: false, undoOk: null as boolean | null,
    list: [] as DoorGuest[], view: [] as DoorGuest[], reqs: [] as DoorRequest[], reqsLoaded: false, seenReq: new Map<string, string>(),
    answers: [] as Answer[], announced: new Set<string>(), showAllAns: false, doneOpen: null as boolean | null,
    typed: {} as Record<string, number>, extraAsk: {} as Record<string, number>,
    busy: false, busyId: null as string | null, failedId: null as string | null,
    lastTouch: 0, lastOk: 0, live: true, wakeOn: false, recent: [] as Recent[], prevPct: null as number | null,
    band: null as Band | null, notice: null as NoticeS | null, ask: null as AskState | null, sending: false,
    numMode: false, q: '', evSheet: false, undoing: new Set<string>(),
  }).current;
  const timers = useRef<{ poll?: ReturnType<typeof setTimeout>; render?: ReturnType<typeof setTimeout>; band?: ReturnType<typeof setTimeout> }>({}).current;
  const redraw = useCallback(() => { if (alive.current) bump(); }, []);
  const P = (n: number) => countWord(n, 'person', lang);
  const tm = (iso: string | number | null | undefined) => (iso ? fmtTime(new Date(iso).toISOString(), lang) : '');

  // ---------- live / offline ----------
  const setLive = (on: boolean) => { if (on) S.lastOk = Date.now(); if (S.live !== on) { S.live = on; redraw(); } };

  // ---------- the meter milestones ----------
  const checkMilestones = () => {
    if (!S.ev) return;
    const m = doorMeter(S.list);
    if (S.prevPct !== null && m.expected) for (const x of [50, 100]) {
      const k = `door-ms-${S.ev.id}-${x}`;
      if (S.prevPct < x && m.pct >= x && !milestones.has(k)) { milestones.add(k); toast(x === 100 ? T.everyone : T.half); }
    }
    if (S.list.length) S.prevPct = m.pct;
  };

  const renderList = () => { clearTimeout(timers.render); S.view = S.list; redraw(); };

  // the upgraded functions went missing: carry on the old way
  const dropV2 = () => { S.v2 = false; S.undoOk = false; S.ask = null; S.reqs = []; redraw(); };

  // ---------- loading ----------
  const loadList = async () => {
    const ev = S.ev; if (!ev) return;
    const r = await api.doorList(ev.id, S.v2);
    if (!alive.current || S.ev?.id !== ev.id) return;
    if (S.v2 && !r.v2) dropV2();
    if (r.error) { setLive(false); if (!S.list.length) toast(T.err); return; }
    setLive(true);
    S.list = r.data ?? [];
    checkMilestones();
    // don't redraw under the door's thumb right after they tapped the stepper
    const wait = 4000 - (Date.now() - S.lastTouch);
    clearTimeout(timers.render);
    if (wait > 0) { redraw(); timers.render = setTimeout(renderList, wait); return; }
    renderList();
  };

  const loadReqs = async () => {
    const ev = S.ev;
    if (!S.v2 || !ev) { S.reqs = []; redraw(); return; }
    const r = await api.listRequests(ev.id);
    if (r.error || !alive.current || S.ev?.id !== ev.id) return;
    S.reqs = r.data ?? [];
    let decided = false;
    for (const x of S.reqs) {
      if (S.reqsLoaded && S.seenReq.get(x.id) === 'pending' && x.status !== 'pending') { S.answers.unshift({ id: x.id, status: x.status, name: x.name, people: x.people }); decided = true; }
      S.seenReq.set(x.id, x.status);
    }
    S.reqsLoaded = true;
    if (decided) {
      haptics.warn();
      const fresh = S.answers.filter((a) => !S.announced.has(a.id));
      fresh.forEach((a) => S.announced.add(a.id));
      const say = fresh.map((a) => (a.status === 'approved' ? T.okBanner(a.name, P(a.people)) + '. ' + T.okBannerSub : T.noBanner(a.name) + '. ' + T.noBannerSub)).join(' ');
      try { if (say) AccessibilityInfo.announceForAccessibility(say); } catch { /* not on this platform */ }
      loadList();
    }
    redraw();
  };

  const refresh = async () => { if (!S.ev) return; await loadList(); await loadReqs(); };
  // every 15 s, every 5 s while the door waits for the hosts
  const schedule = () => {
    clearTimeout(timers.poll);
    const fast = S.reqs.some((r) => r.status === 'pending');
    timers.poll = setTimeout(async () => { await refresh(); if (alive.current) schedule(); }, fast ? 5000 : 15000);
  };

  // ---------- open the event ----------
  const pick = async (e: Ev) => {
    S.ev = e; kv.set(KEYS.doorEvent, e.id);
    S.notice = null; S.ask = null; S.list = []; S.view = []; S.reqs = []; S.seenReq.clear(); S.reqsLoaded = false; S.answers = []; S.announced.clear();
    S.showAllAns = false; S.prevPct = null; S.failedId = null; S.band = null; clearTimeout(timers.band); S.q = ''; S.typed = {}; S.extraAsk = {};
    const stored = kv.getJSON<unknown>(KEYS.doorRecent(e.id), []);
    S.recent = ownRecent(stored, email);
    // someone else's (or yesterday's) rows: off the phone, not just off the screen
    if (Array.isArray(stored) && stored.length !== S.recent.length) saveRecent();
    S.phase = 'ready'; redraw();
    await loadList(); await loadReqs(); schedule();
  };

  useEffect(() => {
    alive.current = true;
    let off = false;
    (async () => {
      S.phase = 'loading'; redraw();
      const home = await api.loadDoorHome(email);
      if (off) return;
      S.v2 = home.v2; S.canHost = home.canHost; S.events = home.events;
      const ev = home.events.find((x) => x.id === id);
      if (!ev) {
        // an old or shared link to an event this login can't open: go to the one door.html would pick
        const alt = api.pickDoorEvent(home.events, kv.get(KEYS.doorEvent));
        if (alt) { router.replace({ pathname: '/door/[id]', params: { id: alt.id } }); return; }
        S.phase = 'none'; redraw(); return;
      }
      api.probeUndo(S.v2).then((u) => { S.undoOk = u; redraw(); });
      pick(ev);
    })();
    return () => { off = true; clearTimeout(timers.poll); clearTimeout(timers.render); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, email]);

  useEffect(() => () => { alive.current = false; clearTimeout(timers.poll); clearTimeout(timers.render); clearTimeout(timers.band); }, [timers]);

  // back to the app, or online again: look now
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active' && S.ev) refresh().then(schedule); });
    const k = setInterval(() => { if (S.ev && S.lastOk && Date.now() - S.lastOk > 30000) setLive(false); }, 5000);
    return () => { sub.remove(); clearInterval(k); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the phone awake between guests
  useEffect(() => {
    let on = false;
    (async () => {
      try {
        if (!(await isAvailableAsync())) return;
        await activateKeepAwakeAsync('sina-door');
        on = true; S.wakeOn = true; redraw();
      } catch { S.wakeOn = false; }
    })();
    return () => { if (on) deactivateKeepAwake('sina-door').catch(() => {}); };
  }, [S, redraw]);

  // ---------- the green band ----------
  const showBand = (info: Info) => {
    clearTimeout(timers.band);
    S.band = { kind: 'ci', info };
    timers.band = setTimeout(() => { S.band = null; redraw(); }, BAND_MS);
    redraw();
  };
  const infoBand = (tone: 'ok' | 'wait' | 'no', text: string, sub: string | undefined, ms: number, named?: { tpl: (x: string) => string; name: string }) => {
    clearTimeout(timers.band);
    S.band = { kind: 'info', tone, text, sub, ...named };
    if (ms) timers.band = setTimeout(() => { S.band = null; redraw(); }, ms);
    redraw();
  };

  // ---------- check in ----------
  function saveRecent() { if (S.ev) kv.setJSON(KEYS.doorRecent(S.ev.id), S.recent); }
  const welcome = (info: Info, keep: boolean) => {
    haptics.success();
    info.q = S.q;                        // the search that found them, for Undo
    S.recent = [{ name: info.name, n: info.n, at: info.at, id: info.id, q: info.q, u: !!info.undo, by: who(email) }, ...S.recent.filter((r) => r.id !== info.id)].slice(0, 6);
    saveRecent();
    showBand(info);
    if (keep) { renderList(); return; }  // stays on screen, ready for "Ask the hosts about +1"
    S.q = ''; renderList(); inputRef.current?.focus();
  };
  const notice = (n: NoticeS) => { S.notice = n; redraw(); };
  const closeNotice = () => { S.notice = null; redraw(); };

  const show = (r: CheckInResult & { seats?: number }, g: DoorGuest | undefined, keep: boolean) => {
    const close: NoticeBtn = { label: T.closeNote, kind: 'secondary', onPress: closeNotice, testID: 'notice-close' };
    if (S.v2) {
      // everyone on the invite is already in (another door, or a retry after a lost answer): say so plainly
      if (!r.ok && r.reason === 'over' && !r.left && (r.allowed || 0) > 0 && (r.arrived || 0) >= (r.allowed || 0)) {
        if (g) g.checked_in_count = r.arrived || 0;
        haptics.warn();
        notice({ tone: 'wait', title: T.alreadyK(r.arrived || 0), name: r.name || g?.name || '', sub: T.alreadyNow(r.arrived || 0), buttons: [close] });
        renderList();
        return;
      }
      if (!r.ok && r.reason === 'over' && g) {
        haptics.warn();
        const btns: NoticeBtn[] = [];
        if (r.left) btns.push({ label: T.checkInNow(r.left), kind: 'primary', onPress: () => { closeNotice(); checkIn(g.id, r.left); }, testID: 'notice-in-now' });
        btns.push({ label: T.askHost, kind: r.left ? 'secondary' : 'primary', onPress: () => { closeNotice(); openAsk({ guest: g.id, name: g.name, people: 1 }); }, testID: 'notice-ask' });
        btns.push({ ...close, kind: 'quiet' });
        notice({ tone: 'wait', title: T.overK, name: r.name || g.name, sub: r.left ? T.over(r.left) : T.overNone, buttons: btns });
        return;
      }
      if (!r.ok || !g) { haptics.error(); notice({ tone: 'no', title: T.notFoundH, name: g ? g.name : '', buttons: [close] }); return; }
      welcome({ id: g.id, name: r.name || g.name, n: r.people || 0, left: r.left || 0, status: r.status || g.status, at: Date.now(), undo: true }, keep);
      return;
    }
    if (!r.ok || !g) { haptics.error(); notice({ tone: 'no', title: T.notFoundH, name: g ? g.name : '', sub: T.notFoundOld, buttons: [close] }); return; }
    if (r.already) { haptics.warn(); notice({ tone: 'wait', title: T.alreadyOld, name: r.name || g.name, sub: P(r.seats || g.seats), buttons: [close] }); return; }
    welcome({ id: g.id, name: r.name || g.name, n: r.seats || g.seats, left: 0, status: r.status || g.status, at: Date.now(), undo: false }, false);
  };

  /** n: how many now; extra: people over the allowance still to ask the hosts about (keeps the guest on screen) */
  async function checkIn(gid: string, n?: number, extra?: number) {
    if (S.busy) return;
    const g = S.list.find((x) => x.id === gid); if (!g) return;
    S.notice = null;
    S.busy = true; S.busyId = gid; S.failedId = null; renderList();
    const before = g.checked_in_count || 0, wasIn = !!g.checked_in_at;
    const people = S.v2 ? n || curN(g, S.typed) : g.seats;
    const r = await api.checkIn(gid, people, S.v2);
    if (!alive.current) return;
    if (r.droppedV2) { S.busy = false; S.busyId = null; dropV2(); loadList(); toast(T.err); return; }
    if (r.error && api.netFail(r.error)) {
      // no answer at all (venue Wi-Fi): the server may have saved it before the line dropped. Look again
      // before offering "Try again", so a second tap never counts the same people twice.
      await loadList();
      const f = S.list.find((x) => x.id === gid);
      if (f && (S.v2 ? (f.checked_in_count || 0) >= before + people : !wasIn && !!f.checked_in_at)) {
        S.busy = false; S.busyId = null; delete S.typed[gid];
        if (S.v2 && extra) S.extraAsk[gid] = extra;
        welcome({ id: gid, name: f.name, n: S.v2 ? people : f.seats, left: S.v2 ? leftOf(f) : 0, status: f.status, at: Date.now(), undo: S.v2 }, !!extra);
        return;
      }
    }
    S.busy = false; S.busyId = null;
    if (r.error) { S.failedId = gid; if (api.netFail(r.error) && Date.now() - S.lastOk > 3000) setLive(false); haptics.error(); renderList(); toast(T.err); return; }
    delete S.typed[gid];
    const d = (r.data || { ok: false }) as CheckInResult & { seats?: number };
    if (d.ok && S.v2) { g.checked_in_count = d.arrived || 0; g.checked_in_at = g.checked_in_at || new Date().toISOString(); if (extra) S.extraAsk[gid] = extra; }
    else if (d.ok) { g.checked_in_at = g.checked_in_at || new Date().toISOString(); g.checked_in_count = g.seats; }
    checkMilestones();
    show(d, g, !!extra); loadList();
  }

  // ---------- undo ----------
  const noMore = (info: Info) => { S.recent.forEach((x) => { if (x.id === info.id && x.at === info.at) x.u = false; }); saveRecent(); redraw(); };
  // Single-flight: each call takes back this login's newest check-in of the guest, so a second tap on the
  // same Undo (band or Just arrived) while the first is on its way would take back a different check-in.
  async function undoCheckIn(info: Info) {
    const key = `${info.id}@${info.at}`;
    if (S.undoing.has(key)) return;
    S.undoing.add(key);
    // the row's Undo goes away at once; it comes back only if the line dropped before an answer
    const row = S.recent.find((x) => x.id === info.id && x.at === info.at), rowU = !!row?.u;
    if (row) row.u = false;
    S.band = null;
    infoBand('wait', T.undoing, undefined, 0);
    try { await undoOnce(info, () => { if (row && rowU) { row.u = true; saveRecent(); } }); } finally { S.undoing.delete(key); redraw(); }
  }
  async function undoOnce(info: Info, putBack: () => void) {
    const r = await api.undoCheckIn(info.id, info.n);
    if (!alive.current) return;
    if (r.missing) { S.undoOk = false; showBand({ ...info }); return; }
    if (r.error && r.error.code) {          // the server said no (e.g. door access ended): retrying won't help
      noMore(info); haptics.error();
      infoBand('no', T.band(info.name, info.n), T.undoFail, 15000, { tpl: (x) => T.band(x, info.n), name: info.name });
      return;
    }
    if (r.error) { putBack(); toast(T.err); showBand(info); return; }
    const d = r.data || { ok: false };
    if (!d.ok) {
      const why = d.reason === 'too_late' ? T.undoLate : d.reason === 'not_yours' ? T.undoNotYours : T.undoNothing;
      noMore(info); haptics.error();
      infoBand('no', T.band(info.name, info.n), why, 15000, { tpl: (x) => T.band(x, info.n), name: info.name });
      return;
    }
    haptics.warn();
    const g = S.list.find((x) => x.id === info.id);
    if (g) { g.checked_in_count = d.arrived || 0; if (!d.arrived) g.checked_in_at = null; }
    S.recent = S.recent.filter((x) => !(x.id === info.id && x.at === info.at)); saveRecent();
    infoBand('wait', T.undone(info.name), undefined, 8000, { tpl: (x) => T.undone(x), name: info.name });
    // back to the search that found them, so the right guest is one tap away
    if (info.q != null && !S.q) S.q = info.q;
    renderList(); loadList();
  }

  // ---------- asking the hosts ----------
  const openAsk = (p: { guest: string | null; name: string; people: number }) => {
    S.ask = { reason: null, note: '', ...p, people: Math.max(1, Math.min(MAX_ASK, p.people || 1)) };
    redraw();
  };
  async function sendAsk() {
    const p = S.ask; if (!p || !S.ev) return;
    const name = String(p.name || '').trim(), n = Math.min(MAX_ASK, Math.max(1, p.people || 1));
    if (!name) { toast(T.needName); return; }
    if (S.sending) return;
    S.sending = true; redraw();
    const note = [p.reason != null ? T.reasons[p.reason] : '', String(p.note || '').trim()].filter(Boolean).join(' · ') || null;
    const r = await api.requestException({ eventId: S.ev.id, guestId: p.guest, name, people: n, note });
    S.sending = false;
    if (!alive.current) return;
    if (r.error) { redraw(); toast(T.err); return; }
    if (p.guest) { delete S.typed[p.guest]; delete S.extraAsk[p.guest]; }
    S.ask = null; S.notice = null; S.q = ''; renderList(); toast(T.sent);
    await loadReqs(); schedule();
  }

  // ---------- search box ----------
  const setQ = (v: string) => {
    const wasEmpty = !S.q.trim();
    S.notice = null; S.q = v; renderList();
    // the results sit right under the search
    if (wasEmpty && v.trim()) scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  const clearQ = () => { S.q = ''; renderList(); inputRef.current?.focus(); };
  const toggleKb = () => {
    S.numMode = !S.numMode; haptics.tap(); redraw();
    // the keyboard only changes when the box is focused again
    if (Platform.OS !== 'web') { inputRef.current?.blur(); setTimeout(() => inputRef.current?.focus(), 60); }
  };

  const step = (g: DoorGuest, d: 1 | -1) => {
    const left = leftOf(g), n = Math.max(1, Math.min(left + 6, curN(g, S.typed) + d));
    S.typed[g.id] = n; S.lastTouch = Date.now(); if (S.failedId === g.id) S.failedId = null;
    redraw();
  };
  const tapCheckIn = (g: DoorGuest) => {
    if (!S.v2) { checkIn(g.id); return; }
    const left = leftOf(g), n = curN(g, S.typed);
    if (n > left) checkIn(g.id, left, n - left); else checkIn(g.id, n);
  };

  // ======================================================================= draw
  const ev = S.ev;
  const header = <Stack.Screen options={{ title: ev?.title ?? T.title, ...doorWebBack, headerRight: ev ? () => <LivePill on={S.live} label={S.live ? T.live : T.offline} /> : undefined }} />;
  if (S.phase === 'loading') return <View style={{ flex: 1, backgroundColor: c.bg }}>{header}<Busy /></View>;
  if (S.phase === 'none' || !ev) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: c.bg, padding: gutter }}>
        {header}
        <EmptyState title={T.noEventsH} body={T.noEvents} testID="door-none" />
      </SafeAreaView>
    );
  }

  const q = S.q.trim(), typing = !!q, v2 = S.v2;
  const m = doorMeter(S.list);
  const noneAr = lang === 'ar' && !m.arrived;
  const when = T.when(daysTo(ev.starts_at) ?? 0);
  const sub = [m.noReply ? T.noReplyN(m.noReply) : '', when].filter(Boolean).join(' · ');
  const pend = v2 ? S.reqs.filter((r) => r.status === 'pending').length : 0;

  // ---- the band
  let band: ReactNode = null;
  const bandTitle = (tpl: (x: string) => string, name: string) => (
    <Sentence v="name" weight="bold" tpl={tpl} name={name} color={toneColors(c, S.band?.kind === 'info' ? S.band.tone : 'ok').strongInk} numberOfLines={typing ? 1 : undefined} testID="door-band-text" />
  );
  if (S.band?.kind === 'ci') {
    const i = S.band.info, canUndo = i.undo && v2 && S.undoOk !== false;
    const note = i.status === 'no' ? T.hadDeclined : i.status === 'pending' ? T.noReplySub : '';
    const bsub = [i.left ? T.bandLeft(i.left) : '', note, tm(i.at)].filter(Boolean).join(' · ');
    band = <DoorBand tone="ok" compact={typing} title={bandTitle((x) => T.band(x, i.n), i.name)} sub={bsub} hint={canUndo ? undefined : T.undoNo}
      undoLabel={canUndo ? T.undo : undefined} onUndo={canUndo ? () => undoCheckIn(i) : undefined} />;
  } else if (S.band?.kind === 'info') {
    const b = S.band;
    band = <DoorBand tone={b.tone} compact={typing} title={b.name != null ? bandTitle(b.tpl!, b.name) : <Txt v="name" color={toneColors(c, b.tone).strongInk} style={{ fontFamily: bodyFont(scriptOf(b.text), 'bold') }} testID="door-band-text">{b.text}</Txt>} sub={b.sub} />;
  }

  // ---- answers from the hosts
  const shownAns = typing ? S.answers.slice(0, 1) : S.showAllAns ? S.answers : S.answers.slice(0, ANS_SHOWN);
  const restAns = typing ? 0 : S.answers.length - shownAns.length;
  const hideAnswer = (aid: string) => { S.answers = S.answers.filter((a) => a.id !== aid); if (S.answers.length <= ANS_SHOWN) S.showAllAns = false; redraw(); };

  // ---- results
  let body: ReactNode;
  let showUnlisted = v2;
  const noticePrimary = !!S.notice?.buttons.some((b) => b.kind === 'primary');
  if (!typing) {
    for (const k of Object.keys(S.typed)) delete S.typed[k];
    const canUndoRec = (r: Recent) => !!r.u && v2 && S.undoOk === true && Date.now() - r.at < UNDO_MS;
    body = (
      <>
        {S.recent.length ? (
          <>
            <Cap>{T.justArrived}</Cap>
            <RowList testID="door-recent">
              {S.recent.map((r, i) => (
                <RecentRow key={r.id + r.at} testID={`recent-${i}`} name={r.name} sub={P(r.n)} time={tm(r.at)}
                  undoLabel={canUndoRec(r) ? T.undo : undefined}
                  onUndo={canUndoRec(r) ? () => undoCheckIn({ id: r.id, name: r.name, n: r.n, at: r.at, q: r.q, undo: true, left: 0, status: '' }) : undefined}
                  onFind={() => setQ(r.name)} />
              ))}
            </RowList>
            <View style={{ marginTop: space[2], paddingHorizontal: 4 }}><Txt2 small>{T.tapFind}</Txt2></View>
          </>
        ) : null}
        <View style={{ alignItems: 'center', paddingTop: 28, paddingHorizontal: 18, paddingBottom: 6, gap: 12 }} testID="door-idle">
          <View style={{ maxWidth: 320 }}><Txt2 center muted>{T.typeName}</Txt2></View>
          {S.wakeOn ? (
            <View testID="door-awake" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, backgroundColor: c.card }}>
              <Icon name="moon" sm color={c.muted} /><Txt2 small>{T.awake}</Txt2>
            </View>
          ) : null}
        </View>
      </>
    );
  } else if (isDigits(q) && digitsOf(q).length < 4) {
    body = <View style={{ alignItems: 'center', paddingTop: 22, paddingHorizontal: 18 }} testID="door-hint"><Txt2 center muted>{T.digitsHint}</Txt2></View>;
  } else {
    const { hits, top, sim, letters } = orderHits(S.view, q, v2);
    if (hits.length) {
      const shown = hits.slice(0, 30);
      const onScreen = new Set(shown.map((h) => h.g.id));
      for (const k of Object.keys(S.typed)) if (!onScreen.has(k)) delete S.typed[k];
      let first = !noticePrimary, divided = top === 0;
      const rows: ReactNode[] = [];
      if (top === 0) rows.push(<Note key="dym" text={T.didYouMean} />);
      else if (sim.length > 1 && letters >= 2) rows.push(<Note key="amb" text={T.ambiguous(sim.length)} wait />);
      for (const h of shown) {
        if (!divided && h.tier === 0) { rows.push(<Note key="sim" text={T.similar} />); divided = true; }
        const g = h.g, st = stateOf(g, v2), left = leftOf(g), n = curN(g, S.typed);
        const hasCi = st !== 'all' && (!v2 || st !== 'no');
        const primary = hasCi && first; if (hasCi) first = false;
        rows.push(
          <GuestCard key={g.id} g={g} v2={v2} t={T} state={st} ranges={h.ranges} phoneDigits={h.phone} n={n} left={left} allowedN={allowed(g)} time={tm(g.checked_in_at)}
            primary={primary} busy={S.busyId === g.id} listBusy={!!S.busyId} failed={S.failedId === g.id}
            req={v2 ? S.reqs.find((r) => r.guest_id === g.id) : undefined} extraAsk={S.extraAsk[g.id]}
            onStep={(d) => step(g, d)} onCheckIn={() => tapCheckIn(g)}
            onAskX={() => openAsk({ guest: g.id, name: g.name, people: Math.min(6, curN(g, S.typed) - leftOf(g)) })}
            onAsk={() => openAsk({ guest: g.id, name: g.name, people: S.extraAsk[g.id] || 1 })} />,
        );
      }
      body = <View style={{ gap: 10 }} testID="door-results">{rows}</View>;
    } else {
      showUnlisted = false;          // the not-found card already offers "Ask the hosts" (v2)
      body = (
        <View testID="door-notfound" style={{ alignItems: 'center', paddingTop: 20, paddingHorizontal: 18, paddingBottom: 18, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: radius.l }}>
          <Txt2 title center>{T.notFoundH}</Txt2>
          <View style={{ marginTop: 4, marginBottom: v2 ? 16 : 0 }}>{v2 ? <Sentence center tpl={(x) => T.noOne(x)} name={q} /> : <Txt2 center>{T.notFoundOld}</Txt2>}</View>
          {v2 ? <Button kind="primary" big block icon="bell" label={T.askHost} onPress={() => openAsk({ guest: null, name: q, people: 1 })} testID="door-ask-q" /> : null}
        </View>
      );
    }
  }

  // ---- my requests
  const lbl = { pending: T.pending, approved: T.approved, rejected: T.rejected } as const;
  const tone = { pending: 'wait', approved: 'ok', rejected: 'no' } as const;
  const pendR = S.reqs.filter((r) => r.status === 'pending'), doneR = S.reqs.filter((r) => r.status !== 'pending');
  const doneOpen = S.doneOpen ?? !pendR.length;
  const reqRow = (r: DoorRequest) => (
    <Row key={r.id} testID={`req-${r.id}`} end={<ReqTag label={lbl[r.status]} tone={tone[r.status]} waiting={r.status === 'pending'} />}>
      <Txt2 name>{r.name}</Txt2>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 2 }}>
        <Txt2 small>{P(r.people)}</Txt2>
        {r.note ? <Txt2 small>{r.note}</Txt2> : null}
        {r.created_at ? <Txt2 small>{T.ago(Math.max(0, Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60000)))}</Txt2> : null}
      </View>
    </Row>
  );
  const myReqs = v2 && S.reqs.length && !typing ? (
    <View testID="door-reqs" onLayout={(e) => { reqsY.current = e.nativeEvent.layout.y; }}>
      <Cap>{T.reqs}</Cap>
      {pendR.length ? <RowList>{pendR.slice(0, 30).map(reqRow)}</RowList> : null}
      {doneR.length ? (
        <View style={{ marginTop: 10 }}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: doneOpen }} testID="door-answered" onPress={() => { S.doneOpen = !doneOpen; redraw(); }}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
            <Txt2 small ink semi>{T.answered(doneR.length)}</Txt2>
            <View style={{ transform: [{ rotate: doneOpen ? '-90deg' : '90deg' }] }}><Icon name="chev" sm color={c.ink} flip={false} /></View>
          </Pressable>
          {doneOpen ? <RowList>{doneR.slice(0, 30).map(reqRow)}</RowList> : null}
        </View>
      ) : null}
    </View>
  ) : null;

  const waitTap = () => scrollRef.current?.scrollTo({ y: Math.max(0, reqsY.current - 8), animated: !reduceMotion });
  const askG = S.ask?.guest ? S.list.find((x) => x.id === S.ask?.guest) : null;

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }} testID="door-screen">
      {header}
      {/* the head: meter, search, and the green band under it. Typing tucks the meter away. */}
      <View style={{ paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 12, backgroundColor: c.bg, borderBottomWidth: 1, borderBottomColor: c.line, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
        <DoorMeter arrived={m.arrived} label={T.meterL(m.arrived, m.expected)} a11y={noneAr ? T.meterL(0, m.expected) : `${m.arrived} ${T.meterL(m.arrived, m.expected)}`}
          hideNum={noneAr} sub={sub} waitLabel={pend ? T.waitChip(pend) : null} onWait={waitTap} pct={m.pct} typing={typing} />
        <SearchRow ref={inputRef} value={S.q} onChange={setQ} onClear={clearQ} numMode={S.numMode} onKb={toggleKb} t={T} onSubmit={() => inputRef.current?.blur()} />
        {band ? <View style={{ marginTop: typing ? 8 : 10 }}>{band}</View> : null}
      </View>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} keyboardShouldPersistTaps="handled"
        // react-native-web blurs on any scroll event with on-drag (the list shrinking as typing starts would close the keyboard)
        keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'} automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 160, width: '100%', maxWidth: 760, alignSelf: 'center', gap: 0 }}>
        {shownAns.length ? (
          <View style={{ gap: 10, marginBottom: 12 }} testID="door-answers">
            {shownAns.map((a) => (
              <AnswerCard key={a.id} ok={a.status === 'approved'} compact={typing} testID={`answer-${a.id}`}
                title={<Sentence weight="semi" numberOfLines={typing ? 1 : undefined} name={a.name} testID={`answer-${a.id}-t`}
                  tpl={(x) => (a.status === 'approved' ? T.okBanner(x, P(a.people)) : T.noBanner(x))} />}
                sub={a.status === 'approved' ? T.okBannerSub : T.noBannerSub} hideLabel={T.dismiss} onHide={() => hideAnswer(a.id)} />
            ))}
            {restAns > 0 ? <View style={{ alignItems: 'center' }}><QuietLink icon="chev" label={T.moreAns(restAns)} onPress={() => { S.showAllAns = true; redraw(); }} testID="door-more-answers" /></View> : null}
          </View>
        ) : null}
        {S.notice ? <View style={{ marginBottom: 12 }}><Notice {...S.notice} /></View> : null}
        {body}
        {showUnlisted ? (
          <View style={{ alignItems: 'center', marginTop: 16 }}>
            <QuietLink icon="bell" label={T.unlisted} onPress={() => openAsk({ guest: null, name: q, people: 1 })} testID="door-unlisted" />
          </View>
        ) : null}
        {myReqs}
        {!typing && (S.canHost || S.events.length > 1) ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 12, rowGap: 4, marginTop: 22 }} testID="door-links">
            {S.events.length > 1 ? <QuietLink ink icon="calendar" label={T.switchEv} onPress={() => { S.evSheet = true; redraw(); }} testID="door-switch" /> : null}
            {S.canHost ? <QuietLink ink icon="home" label={T.hostDash} onPress={() => router.push({ pathname: '/event/[id]', params: { id: ev.id } })} testID="door-host" /> : null}
          </View>
        ) : null}
      </ScrollView>

      <AskSheet ask={S.ask} onChange={(a) => { S.ask = a; redraw(); }} onClose={() => { S.ask = null; redraw(); }} onSend={sendAsk} sending={S.sending}
        allowedLine={askG ? T.allowedLine(allowed(askG), askG.checked_in_count || 0) : null} />

      <Sheet visible={S.evSheet} onClose={() => { S.evSheet = false; redraw(); }} title={T.events} closeLabel={T.close} testID="door-events">
        <RowList flat>
          {S.events.map((e) => (
            <Row key={e.id} title={e.title} selected={e.id === ev.id} testID={`ev-${e.id}`}
              end={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Txt2 small>{e.starts_at ? dayMon(e.starts_at, lang) : ''}</Txt2>{e.id === ev.id ? <Icon name="check" sm color={c.ink} /> : null}</View>}
              onPress={() => { S.evSheet = false; redraw(); if (e.id !== ev.id) router.replace({ pathname: '/door/[id]', params: { id: e.id } }); }}
              style={e.id === ev.id ? { borderWidth: 1.5, borderColor: c.ink, borderRadius: radius.l } : undefined} />
          ))}
        </RowList>
      </Sheet>
    </SafeAreaView>
  );
}

// ---------- tiny text helpers for this screen ----------
function Txt2({ children, small, center, muted, title, name, ink, semi }: { children: string; small?: boolean; center?: boolean; muted?: boolean; title?: boolean; name?: boolean; ink?: boolean; semi?: boolean }) {
  return (
    <Txt v={title ? 'title' : name ? 'name' : small ? 'small' : 'body'} center={center} tone={muted ? 'muted' : ink ? 'ink' : undefined}
      style={semi ? { fontFamily: bodyFont(scriptOf(children), 'semi') } : undefined}>{children}</Txt>
  );
}
/** a line above the results: "No exact match. Is it one of these?", "2 guests with similar names…" (amber) */
function Note({ text, wait }: { text: string; wait?: boolean }) {
  const { c } = useApp();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 2, marginTop: 2 }} accessibilityRole={wait ? 'alert' : undefined} testID={wait ? 'door-ambiguous' : undefined}>
      {wait ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.waitMark }} /> : null}
      <View style={{ flex: 1 }}><Txt v="body" color={wait ? c.wait : c.ink} style={{ fontFamily: bodyFont(scriptOf(text), 'semi') }}>{text}</Txt></View>
    </View>
  );
}
