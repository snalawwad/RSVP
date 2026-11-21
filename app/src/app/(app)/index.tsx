// One home for everyone (Sama's Figma 24g Your events 151:4222, 04 no events 52:3032, G10 Your invites 143:3951,
// G10a none 143:4015): the events this login hosts, co-hosts or works the door for (my_events_v2), then the
// invitations sent to their phone number (my_invites_v2). Someone who is both a host and a guest sees both lists.
//  - Empty: a neutral line. No create button and no word about the website or paying (Apple: no purchases).
//  - Draft events: "Not sent yet", no actions.
//  - A host with exactly one event and nothing else goes straight into it; door staff with one event straight to
//    the door. Admins always stay here.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandBar, Busy, Button, Icon, PageTitle, Panel, PressScale, Txt } from '../../components';
import { listGuests, type Guest } from '../../lib/api';
import { myEvents, myInvites, myProfile, saveProfile } from '../../lib/api7';
import { daysTo, fmtTime, kwDay, kwParts } from '../../lib/format';
import { peopleComing } from '../../lib/guests';
import { KEYS, kv } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import type { MyEvent, MyInvite } from '../../lib/types7';
import { nb, type Lang } from '../../lib/words';
import { useApp } from '../../providers/AppProvider';
import { mix, radius, scriptOf, size, space } from '../../theme/tokens';

type HomeState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ok'; events: MyEvent[]; invites: MyInvite[]; admin: boolean; name: string };

// Go straight in only once per login, so Back shows this screen. Logging out clears it.
let autoOpened = '';
supabase.auth.onAuthStateChange((e) => { if (e === 'SIGNED_OUT') autoOpened = ''; });

const MON_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MON_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const isAr = (s: string | null | undefined) => !!s && scriptOf(s) === 'ar';
/** The Arabic headline in the Arabic screens when there is one, else the event name. */
export const evName = (e: { title: string; headline?: string | null }, lang: Lang) => (lang === 'ar' && isAr(e.headline) ? e.headline! : e.title);
const pastEvent = (e: { starts_at: string | null; ends_at?: string | null }) => !!e.starts_at && kwDay(e.ends_at || e.starts_at) < kwDay(new Date());

/** Counts for an event the old way (before 0007 or for an admin row): from its guest list. */
function countsOf(gs: Guest[]) {
  let yes_people = 0, yes = 0, no = 0, no_reply = 0, arrived = 0;
  for (const g of gs) {
    if (g.status === 'yes') { yes++; yes_people += peopleComing(g); } else if (g.status === 'no') no++; else no_reply++;
    arrived += g.checked_in_count || 0;
  }
  return { invited: gs.length, yes, yes_people, no, no_reply, arrived };
}

export default function Home() {
  const { t, email, c } = useApp();
  const A = t.a;
  const [home, setHome] = useState<HomeState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);
  const me = email || 'phone';

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      // the name typed on Create account goes to the profile once (save_profile_v2)
      const pend = kv.getJSON<{ name?: string; email?: string | null } | null>(KEYS.pendingProfile, null);
      if (pend?.name) { const r = await saveProfile(pend.name, pend.email ?? null); if (!r.error || /Could not find|PGRST202/.test(r.error.message)) kv.remove(KEYS.pendingProfile); }
      const [ev, inv, prof] = await Promise.all([myEvents(email), myInvites(), myProfile()]);
      if (ev.error || !ev.data) { setHome((h) => (h.kind === 'ok' ? h : { kind: 'error' })); return; }
      const events = ev.data;
      // counts the old way where my_events_v2 didn't give them (old schema, admin rows)
      const need = events.filter((e) => !e.counts && e.role === 'host' && e.status !== 'draft');
      if (need.length) {
        const lists = await Promise.all(need.map((e) => listGuests(e.id)));
        need.forEach((e, i) => { if (!lists[i].error) e.counts = countsOf(lists[i].data ?? []); });
      }
      setHome({ kind: 'ok', events, invites: inv.data ?? [], admin: ev.admin, name: (prof.data?.name || pend?.name || '').trim() });
    } finally {
      busy.current = false;
    }
  }, [email]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // straight in: one hosted event and nothing else → its dashboard; door staff with one event → the door
  useEffect(() => {
    if (home.kind !== 'ok' || autoOpened === me) return;
    autoOpened = me;
    if (home.admin) return;
    const live = home.events.filter((e) => e.status !== 'draft');
    if (live.length !== 1 || home.invites.length || home.events.length !== 1) return;
    const e = live[0];
    const to = e.role === 'door' ? `/door/${e.id}` : `/event/${e.id}`;
    const id = setTimeout(() => router.push(to as never), 0);
    return () => clearTimeout(id);
  }, [home, me]);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const accountBtn = (
    <PressScale kind="chip" testID="menu-btn" accessibilityRole="button" accessibilityLabel={A.account} onPress={() => router.push('/settings')} hitSlop={4}
      style={{ minHeight: size.target, paddingHorizontal: space[4], borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <Icon name="person" sm color={c.ink} />
      <Txt v="label" tone="ink">{A.account}</Txt>
    </PressScale>
  );

  let body: ReactNode;
  if (home.kind === 'loading') body = <Busy />;
  else if (home.kind === 'error') {
    body = (
      <Panel tone="no" testID="events-error">
        <Txt v="name" tone="no">{A.loadErr}</Txt>
        <Txt v="small" tone="no">{t.couldNotLoad}</Txt>
        <Button label={A.retry} kind="secondary" small onPress={refresh} testID="events-retry" />
      </Panel>
    );
  } else {
    const { events, invites, name } = home;
    const ts = (s: string | null) => (s ? new Date(s).getTime() : Infinity);
    const hosting = events.filter((e) => e.role !== 'door' && !pastEvent(e)).sort((a, b) => ts(a.starts_at) - ts(b.starts_at));
    const door = events.filter((e) => e.role === 'door' && !pastEvent(e)).sort((a, b) => ts(a.starts_at) - ts(b.starts_at));
    const invUp = invites.filter((i) => !i.past);
    const pastEv = events.filter(pastEvent).sort((a, b) => ts(b.starts_at) - ts(a.starts_at));
    const pastInv = invites.filter((i) => i.past);
    const empty = !events.length && !invites.length;
    body = (
      <>
        <PageTitle testID="home-title" sub={empty ? <Txt v="body" tone="muted" testID="no-events">{A.emptyP}</Txt> : undefined}>
          {name ? A.hi(name.split(/\s+/)[0]) : A.yourEvents}
        </PageTitle>
        <Button kind="primary" block icon="plus" label={A.rqNew} onPress={() => router.push('/new-event' as never)} testID="rq-new" />
        {hosting.length ? <Section title={A.hosting} testID="events-up">{hosting.map((e) => <EventCard key={e.id} e={e} />)}</Section> : null}
        {door.length ? <Section title={A.atDoor} testID="events-door">{door.map((e) => <EventCard key={e.id} e={e} />)}</Section> : null}
        {invUp.length ? <Section title={hosting.length || door.length ? A.invitedTo : A.comingUp} testID="invites-up">{invUp.map((i) => <InviteCard key={i.token} i={i} />)}</Section> : null}
        {pastEv.length || pastInv.length ? (
          <Section title={A.past} testID="events-past">
            {pastEv.map((e) => <EventCard key={e.id} e={e} />)}
            {pastInv.map((i) => <InviteCard key={i.token} i={i} />)}
          </Section>
        ) : null}
      </>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }} testID="events">
      <BrandBar end={accountBtn} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[5], paddingBottom: space[10], gap: space[5], width: '100%', maxWidth: 760, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.plum} colors={[c.plum]} />}>
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children, testID }: { title: string; children: ReactNode; testID?: string }) {
  return (
    <View style={{ gap: 10 }} testID={testID}>
      <Txt v="label" tone="muted" accessibilityRole="header">{title}</Txt>
      {children}
    </View>
  );
}

/** Figma list card: date tile, name, a line under it, a bold line, and a chevron when it opens. */
function Card({ iso, title, sub, meta, metaTone, onPress, testID, a11y }: {
  iso: string | null; title: string; sub?: string; meta?: string; metaTone?: 'plum' | 'ink' | 'muted'; onPress?: () => void; testID?: string; a11y?: string;
}) {
  const { c, rtl } = useApp();
  const inner = (pressed: boolean) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 84, paddingVertical: 14, paddingHorizontal: space[4], borderRadius: radius.l,
      borderWidth: 1, borderColor: c.line, backgroundColor: pressed ? mix(c.card, c.ink, 0.05) : c.card }}>
      <DateTile iso={iso} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt v="button" numberOfLines={2}>{title}</Txt>
        {sub ? <Txt v="small" numberOfLines={2}>{sub}</Txt> : null}
        {meta ? <Txt v="label" tone={metaTone ?? 'ink'} style={rtl ? undefined : { fontSize: 13.5 }}>{meta}</Txt> : null}
      </View>
      {onPress ? <Icon name="chev" color={c.ink} /> : null}
    </View>
  );
  if (!onPress) return <View testID={testID} accessible accessibilityLabel={a11y}>{inner(false)}</View>;
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress}>{({ pressed }) => inner(pressed)}</Pressable>;
}

function whenLine(iso: string | null, venue: string | null | undefined, lang: Lang, noDate: string) {
  return [iso ? nb(fmtTime(iso, lang)) : noDate, venue || ''].filter(Boolean).join(' · ');
}

function EventCard({ e }: { e: MyEvent }) {
  const { t, lang } = useApp();
  const A = t.a;
  const name = evName(e, lang);
  const sub = whenLine(e.starts_at, e.venue, lang, t.noDate);
  const draft = e.status === 'draft';
  const n = e.counts;
  const meta = draft ? A.draftH
    : e.role === 'door' ? A.doorTag
    : n ? (n.invited ? A.invitesComing(n.invited, n.yes_people) : t.host.emptyG) : '';
  // a draft opens too: its page says it isn't live yet (better than a card that does nothing when tapped)
  const go = () => router.push((e.role === 'door' ? `/door/${e.id}` : `/event/${e.id}`) as never);
  const tag = e.role === 'cohost' ? ` · ${A.cohostTag}` : '';
  return <Card iso={e.starts_at} title={name} sub={sub + tag} meta={meta} metaTone={draft ? 'muted' : 'ink'} onPress={go}
    testID={e.role === 'door' ? `door-ev-${e.id}` : `ev-${e.id}`} a11y={[name, sub, meta].filter(Boolean).join(', ')} />;
}

function InviteCard({ i }: { i: MyInvite }) {
  const { t, lang } = useApp();
  const A = t.a;
  const sub = whenLine(i.event.starts_at, i.event.venue, lang, t.noDate);
  const n = i.confirmed_count || i.seats || 1;
  const meta = i.status === 'yes' ? (i.past ? A.youWent : A.youComing(n)) : i.status === 'no' ? A.youCant : i.past ? A.youMissed : A.waitingReply;
  const d = daysTo(i.event.starts_at);
  return <Card iso={i.event.starts_at} title={i.event.title} sub={sub} meta={meta} metaTone={i.status === 'pending' && !i.past ? 'plum' : 'ink'}
    onPress={() => router.push({ pathname: '/invite/[token]', params: { token: i.token } })}
    testID={`inv-${i.token.slice(0, 8)}`} a11y={[i.event.title, sub, meta, d != null && d >= 0 ? A.inDays(d) : ''].filter(Boolean).join(', ')} />;
}

/** Month over the day number (Figma date tile). No date: a calendar icon. */
function DateTile({ iso }: { iso: string | null }) {
  const { c, lang } = useApp();
  const box = { width: lang === 'ar' ? 60 : 46, minHeight: 54, paddingVertical: 6, borderRadius: radius.m, backgroundColor: c.surface, alignItems: 'center' as const, justifyContent: 'center' as const };
  if (!iso) return <View style={box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name="calendar" color={c.muted} /></View>;
  const p = kwParts(iso);
  return (
    <View style={box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Txt v="label" tone="plum" center numberOfLines={1} style={lang === 'ar' ? { fontSize: 12, lineHeight: 18 } : { fontSize: 11, lineHeight: 14, letterSpacing: 0.6 }}>{lang === 'ar' ? MON_AR[p.m] : MON_EN[p.m]}</Txt>
      <Txt v="title" center script="lat" style={{ fontSize: 22, lineHeight: 26 }}>{String(p.d).padStart(2, '0')}</Txt>
    </View>
  );
}
