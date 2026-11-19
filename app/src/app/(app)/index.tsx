// Your events. Works like the web host page after login (host.html requireLogin):
//  - events this login hosts (door-only events left out unless admin), soonest first, as the web admin list
//    rows: date tile, the event's name, when, and the counts with their words
//  - a host with one event goes straight into it; a door-only member goes straight into door mode
//    (the door screen picks the saved event, else the next one, like door.html). Admins stay on the list
//    (on the web they work from admin.html), however many events there are.
//  - door-only member: the web "Door check-in" card; no events at all: "We're preparing your event"
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Busy, Button, Icon, Kicker, Panel, Row, RowList, Screen, Txt } from '../../components';
import { listEvents, listGuests, loadHostHome, pickDoorEvent, type EventRow, type Guest } from '../../lib/api';
import { links } from '../../lib/config';
import { supabase } from '../../lib/supabase';
import { dayMon, daysTo, fmtTime, kwDay, shortDate } from '../../lib/format';
import { peopleComing } from '../../lib/guests';
import { KEYS, kv } from '../../lib/storage';
import { arN, countWord, nb, type Lang } from '../../lib/words';
import { useApp } from '../../providers/AppProvider';
import { radius, scriptOf, shadow, space } from '../../theme/tokens';

// Words from the web admin event list (admin.html T) that the shared strings don't have yet.
const W = {
  en: {
    homeSub: (u: number, p: number) => (u ? `${u} ${u === 1 ? 'event' : 'events'} coming up` : 'No events coming up') + (p ? ` · ${p} past` : ''),
    upcomingH: 'Coming up', pastH: (n: number) => `Past events (${n})`, noDate: 'No date yet', noGuestsShort: 'No guests yet',
    coming: (n: number) => (n ? `${n} ${n === 1 ? 'person' : 'people'} coming` : 'No one coming yet'), gErrShort: 'Guests didn’t load',
    rowSent: (a: number, b: number) => `${a} of ${b} sent`, retry: 'Try again', sep: ' · ',
  },
  ar: {
    homeSub: (u: number, p: number) => (u ? arN(u, 'مناسبة وحدة جاية', 'مناسبتين جاية', 'مناسبات جاية', 'مناسبة جاية') : 'ما في مناسبات جاية') + (p ? '، و' + arN(p, 'وحدة خلصت', 'ثنتين خلصت', 'خلصت', 'خلصت') : ''),
    upcomingH: 'المناسبات الجاية', pastH: (n: number) => `مناسبات خلصت (${n})`, noDate: 'بدون تاريخ للحين', noGuestsShort: 'ما في ضيوف للحين',
    coming: (n: number) => (n ? arN(n, 'شخص واحد بيحضر', 'شخصين بيحضرون', 'أشخاص بيحضرون', 'شخص بيحضرون') : 'محد أكّد حضوره للحين'), gErrShort: 'الضيوف ما طلعوا',
    rowSent: (a: number, b: number) => `انرسل ${a} من ${b}`, retry: 'جربوا مرة ثانية', sep: '، ',
  },
} satisfies Record<Lang, unknown>;

// admin.html countsOf: phones / sent drive "x of y sent"; yesG / no decide whether the coming line shows
type Counts = { g: number; phones: number; sent: number; yesG: number; no: number; coming: number; err: boolean };
type Home =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'none' }
  | { kind: 'door'; doorId: string | null }
  | { kind: 'list'; events: EventRow[]; doorEvents: EventRow[]; counts: Record<string, Counts>; admin: boolean };

// Go straight in only once per login, so Back from the event or the door shows this screen. Logging out
// (Menu, or deleting the account) clears it, so the next login, even with the same email, goes straight in.
let autoOpened = '';
supabase.auth.onAuthStateChange((e) => { if (e === 'SIGNED_OUT') autoOpened = ''; });

const isAr = (s: string | null | undefined) => !!s && scriptOf(s) === 'ar';
/** The Arabic headline in the Arabic screens when there is one, else the event name (host.html evName). */
const evName = (e: Pick<EventRow, 'title' | 'headline'>, lang: Lang) => (lang === 'ar' && isAr(e.headline) ? e.headline! : e.title);
const isPast = (e: EventRow) => !!e.starts_at && kwDay(e.ends_at || e.starts_at) < kwDay(new Date());

export default function Events() {
  const { t, lang, email, c, rtl } = useApp();
  const w = W[lang];
  const [home, setHome] = useState<Home>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current || !email) return;
    busy.current = true;
    try {
      const r = await loadHostHome(email);
      if (r.error) { setHome((h) => (h.kind === 'list' ? h : { kind: 'error' })); return; }   // keep what we had rather than an empty list
      const doorIds = new Set('doorEventIds' in r ? r.doorEventIds : []);
      if (r.noEvents === 'none') { setHome({ kind: 'none' }); return; }
      if (r.noEvents === 'door') {
        // door.html: the saved event, else the next one (Kuwait date), else the last
        const doorEvents = await doorOnlyEvents(doorIds);
        const pick = pickDoorEvent(doorEvents, kv.get(KEYS.doorEvent));
        setHome({ kind: 'door', doorId: pick?.id ?? null });
        return;
      }
      const lists = await Promise.all(r.events.map((e) => listGuests(e.id)));
      const counts: Record<string, Counts> = {};
      r.events.forEach((e, i) => {
        const gs: Guest[] = lists[i].data ?? [];
        const s: Counts = { g: 0, phones: 0, sent: 0, yesG: 0, no: 0, coming: 0, err: !!lists[i].error };
        gs.forEach((g) => {
          s.g++;
          if (g.phone) { s.phones++; if (g.sent_at) s.sent++; }
          if (g.status === 'yes') { s.yesG++; s.coming += peopleComing(g); } else if (g.status === 'no') s.no++;
        });
        counts[e.id] = s;
      });
      const doorEvents = r.admin ? [] : await doorOnlyEvents(doorIds);
      setHome({ kind: 'list', events: r.events, doorEvents, counts, admin: !!r.admin });
    } finally {
      busy.current = false;
    }
  }, [email]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Straight in: a host with one event → that event's tabs; a door-only member → door mode. Never for admins.
  useEffect(() => {
    if (!email || autoOpened === email) return;
    let to: string | null = null;
    if (home.kind === 'door' && home.doorId) to = `/door/${home.doorId}`;
    else if (home.kind === 'list' && !home.admin && home.events.length === 1 && !home.doorEvents.length) to = `/event/${home.events[0].id}`;
    else if (home.kind === 'list' || home.kind === 'none' || home.kind === 'door') { autoOpened = email; return; }
    if (!to) return;
    autoOpened = email;
    const go = to;
    const id = setTimeout(() => router.push(go as never), 0);
    return () => clearTimeout(id);
  }, [home, email]);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (home.kind === 'loading') return <Screen><Busy /></Screen>;

  if (home.kind === 'error') {
    return (
      <Screen onRefresh={refresh} refreshing={refreshing}>
        <Panel tone="no" testID="events-error">
          <Txt v="name" tone="no">{t.host.loadErrEv}</Txt>
          <Txt v="small" tone="no">{t.couldNotLoad}</Txt>
          <Button label={w.retry} kind="secondary" small onPress={refresh} testID="events-retry" />
        </Panel>
      </Screen>
    );
  }

  if (home.kind === 'none') {
    const wa = links.whatsapp(lang === 'ar' ? 'مرحبا، أبي أحجز مناسبة' : 'Hi, I’d like to book an event');
    return (
      <Screen onRefresh={refresh} refreshing={refreshing} contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <ArchCard testID="no-events">
          <Txt v="title" center style={{ fontSize: 28, lineHeight: lang === 'ar' ? 44 : 34 }}>{t.host.noEvH}</Txt>
          <Txt v="body" tone="muted" center>{t.host.noEvP}</Txt>
          {wa ? <Button label={t.messageUs} kind="primary" icon="whatsapp" block onPress={() => Linking.openURL(wa)} style={{ marginTop: space[3] }} /> : null}
        </ArchCard>
      </Screen>
    );
  }

  if (home.kind === 'door') {
    return (
      <Screen onRefresh={refresh} refreshing={refreshing} contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <ArchCard testID="door-only">
          <Txt v="title" center style={{ fontSize: 28, lineHeight: lang === 'ar' ? 44 : 34 }}>{t.host.doorH}</Txt>
          <Txt v="body" tone="muted" center>{t.host.doorP}</Txt>
          {home.doorId ? (
            <Button label={t.host.doorBtn} kind="primary" icon="door" onPress={() => router.push(`/door/${home.doorId}` as never)} style={{ alignSelf: 'center', marginTop: space[3] }} testID="open-door" />
          ) : null}
        </ArchCard>
      </Screen>
    );
  }

  const { events, doorEvents, counts } = home;
  const ts = (e: EventRow) => (e.starts_at ? new Date(e.starts_at).getTime() : Infinity);
  const up = events.filter((e) => !isPast(e)).sort((a, b) => ts(a) - ts(b));
  const past = events.filter(isPast).sort((a, b) => ts(b) - ts(a));
  const pastOpen = showPast || !up.length;

  return (
    <Screen onRefresh={refresh} refreshing={refreshing} gap={space[3]} testID="events">
      <View style={{ gap: 2, marginBottom: space[2] }}>
        <Txt v="title" style={{ fontSize: 28, lineHeight: lang === 'ar' ? 44 : 34 }}>{t.yourEvents}</Txt>
        <Txt v="small">{w.homeSub(up.length, past.length)}</Txt>
      </View>

      {up.length ? (
        <>
          <Kicker>{w.upcomingH}</Kicker>
          <RowList testID="events-up">{up.map((e) => <EventRowView key={e.id} e={e} s={counts[e.id]} />)}</RowList>
        </>
      ) : null}

      {past.length ? (
        <View style={{ gap: space[3], marginTop: up.length ? space[3] : 0 }}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: pastOpen }} onPress={() => setShowPast(!pastOpen)} disabled={!up.length} testID="past-toggle"
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Txt v="label" tone="muted">{w.pastH(past.length)}</Txt>
            {up.length ? <View style={{ transform: [{ rotate: pastOpen ? (rtl ? '-90deg' : '90deg') : '0deg' }] }}><Icon name="chev" sm color={c.muted} /></View> : null}
          </Pressable>
          {pastOpen ? <RowList testID="events-past">{past.map((e) => <EventRowView key={e.id} e={e} s={counts[e.id]} />)}</RowList> : null}
        </View>
      ) : null}

      {doorEvents.length ? (
        <View style={{ gap: space[3], marginTop: space[3] }}>
          <Kicker>{t.host.doorH}</Kicker>
          <RowList testID="events-door">
            {doorEvents.map((e) => (
              <Row key={e.id} chevron testID={`door-ev-${e.id}`} onPress={() => router.push(`/door/${e.id}` as never)}
                accessibilityLabel={[evName(e, lang), whenOf(e, lang, w.noDate, t.host.cd), t.door.title].join(', ')}
                start={<DateTile iso={e.starts_at} lang={lang} door />}
                title={evName(e, lang)} sub={whenOf(e, lang, w.noDate, t.host.cd)} />
            ))}
          </RowList>
        </View>
      ) : null}
    </Screen>
  );
}

/** Events where this login is door staff only (door.html would show them). */
async function doorOnlyEvents(ids: Set<string>): Promise<EventRow[]> {
  if (!ids.size) return [];
  const r = await listEvents('id, title, headline, starts_at, ends_at, venue, lang, invite_limit, card_image_url');
  return (r.data ?? []).filter((e) => ids.has(e.id));
}

const keep = (s: string) => s.replace(/ /g, '\u00a0');   // no-break spaces: one unit on one line

/** "Sun 20 Dec · 8:00 PM · 35 days to go" (host masthead line). */
function whenOf(e: EventRow, lang: Lang, noDate: string, cd: (n: number) => string) {
  if (!e.starts_at) return noDate;
  const n = daysTo(e.starts_at);
  // each part is no-break, so a line only ever breaks at a " · " (never «باقي» / «35 يوم»)
  return [shortDate(e.starts_at, lang), nb(fmtTime(e.starts_at, lang)), n == null ? '' : keep(cd(n))].filter(Boolean).join(' · ');
}

/** One event (web admin .evrow): date tile, name, when, then the guests and people coming. */
function EventRowView({ e, s }: { e: EventRow; s?: Counts }) {
  const { t, lang } = useApp();
  const w = W[lang];
  const name = evName(e, lang);
  const when = whenOf(e, lang, w.noDate, t.host.cd);
  // admin.html evRow (each part one piece, breaking only at the separators): the guests, then "x of y sent" when anyone has a number, then who's coming once anyone has replied
  const prog = !s ? '' : s.err ? w.gErrShort : s.g
    ? [countWord(s.g, 'guest', lang), s.phones ? w.rowSent(s.sent, s.phones) : '', s.yesG || s.no ? w.coming(s.coming) : ''].filter(Boolean).map(keep).join(w.sep)
    : w.noGuestsShort;
  return (
    <Row testID={`ev-${e.id}`} chevron onPress={() => router.push(`/event/${e.id}` as never)}
      accessibilityLabel={[name, when, prog].filter(Boolean).join(', ')}
      start={<DateTile iso={e.starts_at} lang={lang} />} style={{ minHeight: 78 }}>
      <Txt v="name" numberOfLines={2}>{name}</Txt>
      <Txt v="small">{when}</Txt>
      {prog ? <Txt v="small" tone={s?.err ? 'no' : 'ink'}>{prog}</Txt> : null}
    </Row>
  );
}

/** Web .dblock: month in plum over the day number. No date: a calendar icon. Door events: a door icon. */
function DateTile({ iso, lang, door }: { iso: string | null; lang: Lang; door?: boolean }) {
  const { c } = useApp();
  const box = { width: lang === 'ar' ? 64 : 52, height: 60, borderRadius: radius.m, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 2 };
  if (!iso || door) return <View style={box} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden><Icon name={door ? 'door' : 'calendar'} color={door ? c.plum : c.muted} /></View>;
  const [day, ...mon] = dayMon(iso, lang).split(' ');
  return (
    <View style={box} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Txt v="label" tone="plum" center numberOfLines={1} style={{ fontSize: 14, lineHeight: 18 }}>{mon.join(' ')}</Txt>
      <Txt v="name" center script="lat" style={{ fontSize: 22, lineHeight: 26 }}>{day}</Txt>
    </View>
  );
}

/** The web login box: an arch-topped card with a hairline inside it. */
function ArchCard({ children, testID }: { children: ReactNode; testID?: string }) {
  const { c, theme } = useApp();
  const [wd, setWd] = useState(358);
  const r = Math.min(220, wd / 2);
  return (
    <View testID={testID} onLayout={(e) => setWd(e.nativeEvent.layout.width)}
      style={[{ width: '100%', maxWidth: 400, alignSelf: 'center', backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderTopLeftRadius: r, borderTopRightRadius: r, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, paddingTop: 58, paddingHorizontal: 26, paddingBottom: 30, gap: space[2] }, shadow(theme, true)]}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 8, left: 8, right: 8, bottom: 8, borderWidth: 1, borderColor: c.line, borderTopLeftRadius: r - 8, borderTopRightRadius: r - 8, borderBottomLeftRadius: 13, borderBottomRightRadius: 13 }} />
      {children}
    </View>
  );
}
