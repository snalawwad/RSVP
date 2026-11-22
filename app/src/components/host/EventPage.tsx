// The event's page (Sama's Figma 24e, 22 Nov evening): no tabs. "Guests" with Add, the plum package card (opens
// Your package), search, the four filters and the list. Invitations go out through our team, so guests not sent
// yet show "Sending…". Door requests (on the night) show as a red bar that opens the arrivals; Delete event is
// at the bottom for the main host.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { isUnsent, peopleComing, sideOf, stats } from '../../lib/guests';
import { asciiDigits, searchNames } from '../../lib/names';
import { useApp } from '../../providers/AppProvider';
import { mix, radius, space } from '../../theme/tokens';
import { AlertBar } from '../AlertBar';
import { Button } from '../Button';
import { Field } from '../Field';
import { Icon } from '../Icon';
import { MainTabBar } from '../MainTabBar';
import { Screen } from '../Screen';
import { Txt } from '../Txt';
import { DeleteEvent } from './DeleteEvent';
import { GuestSheet } from './GuestSheet';
import { useHost, type Filter } from './HostContext';
import { CountSeg, usePull } from './parts';
import type { Guest } from '../../lib/api';


/** The arch-shaped letter tile in front of each guest (Figma 24e). */
function Initial({ name, tone }: { name: string; tone: 'ok' | 'no' | 'wait' | 'mute' }) {
  const { c } = useApp();
  const bg = tone === 'ok' ? c.okBg : tone === 'no' ? c.noBg : tone === 'wait' ? c.waitBg : c.surface;
  return (
    <View style={{ width: 36, height: 40, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 5, borderBottomRightRadius: 5, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Txt v="name" style={{ fontSize: 16 }}>{name.trim().charAt(0).toUpperCase() || '?'}</Txt>
    </View>
  );
}

export function EventPage() {
  const { t, c, lang, rtl } = useApp();
  const T = t.host, A = t.a;
  const h = useHost();
  const pull = usePull();
  const [openId, setOpenId] = useState<string | null>(null);
  const ev = h.ev;
  const guests = h.guests, p = h.pool, s = stats(p);
  const q = h.query.trim(), qd = asciiDigits(q).replace(/\D/g, '');
  if (!ev) return null;

  const pkg = h.me?.package ? (A.pkgShort[h.me.package] || h.me.package) : null;
  const lim = ev.invite_limit || 0;

  // ---------- the list ----------
  let list: Guest[];
  if (q) {
    const byName = searchNames(p, q).map((x) => x.item);
    const byPhone = qd.length >= 3 ? p.filter((g) => (g.phone || '').includes(qd) && !byName.includes(g)) : [];
    list = byName.concat(byPhone);
  } else {
    const order = (g: Guest) => (isUnsent(g) ? 0 : g.status === 'pending' ? 1 : g.status === 'yes' ? 2 : 3);
    list = (h.filter === 'all' ? p : p.filter((g) => g.status === h.filter)).slice().sort((a, b) => order(a) - order(b));
  }
  const N = { all: p.length, yes: s.yes.length, pending: s.pend.length, no: s.no.length };

  const row = (g: Guest, i: number) => {
    const unsent = isUnsent(g);
    const tone = unsent ? 'mute' : g.status === 'yes' ? 'ok' : g.status === 'no' ? 'no' : 'wait';
    const word = unsent ? A.sendingDots : g.status === 'yes' ? T.K.yes : g.status === 'no' ? A.cantShort : A.noReplyYet;
    const bits: string[] = [];
    if (g.status === 'yes') bits.push(T.ofPeople(peopleComing(g), g.seats || 1));
    else if ((g.seats || 1) > 1 && g.status === 'pending') bits.push(A.plusExtra((g.seats || 1) - 1));
    if (g.checked_in_at) bits.push(T.arrived);
    if (sideOf(g)) bits.push(sideOf(g) as string);
    return (
      <Pressable key={g.id} accessibilityRole={h.cohost ? undefined : 'button'} accessibilityLabel={[g.name, word, ...bits].join(', ')} disabled={h.cohost} onPress={() => setOpenId(g.id)} testID={`open-${g.id}`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 64, paddingVertical: 10, paddingHorizontal: space[4],
          borderTopWidth: i ? 1 : 0, borderTopColor: c.line, backgroundColor: pressed ? mix(c.card, c.ink, 0.06) : h.isFresh(g.id) ? c.okBg : 'transparent' })}>
        <Initial name={g.name} tone={tone} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="name" numberOfLines={1}>{g.name}</Txt>
          <Txt v="small" numberOfLines={1}>
            <Txt v="small" tone={tone === 'ok' ? 'ok' : tone === 'no' ? 'no' : tone === 'wait' ? 'wait' : 'muted'} style={{ fontWeight: '600' }}>{word}</Txt>
            {bits.length ? <Txt v="small" tone="muted">{` · ${bits.join(' · ')}`}</Txt> : null}
          </Txt>
        </View>
        {h.cohost ? null : <Icon name="chev" sm color={c.muted} />}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen edges={['left', 'right']} bottom={space[6]} gap={space[4]} {...pull} testID="event-page">
        {/* Figma 24e (22 Nov evening): Guests + Add, the package card, search, filters, the list */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
          <Txt v="title" accessibilityRole="header" style={{ fontSize: 30, lineHeight: 36 }}>{T.tGuests}</Txt>
          {h.cohost ? <Txt v="body" tone="muted" testID="g-sum">{A.nInvites(guests.length)}</Txt>
            : <Button small kind="secondary" icon="plus" label={A.addShort} onPress={() => h.openAdd(false)} testID="add-guest" />}
        </View>

        {h.openReqs.length && !h.cohost ? (
          <AlertBar count={h.openReqs.length} icon="door" text={T.reqBar(h.openReqs.length)} go={T.reqGo} onPress={() => router.push(`/event/${h.id}/arrivals` as never)} testID="ev-door-reqs" />
        ) : null}

        <Pressable accessibilityRole="button" disabled={h.cohost} onPress={() => router.push(`/package/${h.id}` as never)} testID="ev-package"
          accessibilityLabel={[A.yourPackage, pkg, lim ? A.invitesUsed(guests.length, lim) : ''].filter(Boolean).join(', ')}>
          {({ pressed }) => (
            <View style={{ borderRadius: radius.l, backgroundColor: c.plum, padding: space[5], gap: space[2], overflow: 'hidden', opacity: pressed ? 0.92 : 1 }}>
              <View style={{ position: 'absolute', right: -6, bottom: -26 }} pointerEvents="none"><Icon name="arch" size={150} color="rgba(255,255,255,0.13)" /></View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Txt v="label" style={{ color: 'rgba(255,255,255,0.75)', letterSpacing: lang === 'ar' ? 0 : 1.2, textTransform: 'uppercase', fontSize: 12 }}>{A.yourPackage}</Txt>
                {h.cohost ? null : <Icon name="chev" sm color="#FFFFFF" flip={rtl} />}
              </View>
              <Txt v="title" style={{ color: '#FFFFFF', fontSize: 28, lineHeight: 34 }}>{pkg || A.pkgNone}</Txt>
              {lim ? (
                <>
                  <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden', marginTop: space[1] }}>
                    <View style={{ height: 6, width: `${Math.min(100, Math.round((guests.length / lim) * 100))}%`, backgroundColor: '#FFFFFF' }} />
                  </View>
                  <Txt v="small" style={{ color: 'rgba(255,255,255,0.85)' }}>{A.invitesUsed(guests.length, lim)}</Txt>
                </>
              ) : null}
            </View>
          )}
        </Pressable>

        <Field search value={h.query} onChangeText={h.setQuery} placeholder={A.searchShort} accessibilityLabel={T.search} autoCorrect={false} testID="g-search" />
        {guests.length ? (
          <CountSeg<Filter> label={T.filterBy} testID="filter" value={q ? 'all' : h.filter} onChange={(k) => { h.setFilter(k); h.setQuery(''); }}
            options={(['all', 'yes', 'pending', 'no'] as Filter[]).map((k) => ({ key: k, label: T.K[k], count: N[k], a11y: `${T.K[k]}: ${h.cw(N[k], 'guest')}` }))} />
        ) : null}

        {!h.guestsLoaded ? null : !guests.length ? (
          <Txt v="body" tone="muted" center style={{ paddingVertical: space[5] }} testID="g-empty">{T.emptyG}</Txt>
        ) : (
          <View testID="g-list" style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: radius.l, overflow: 'hidden' }}>
            {list.length ? list.map(row) : <View style={{ padding: space[5] }}><Txt v="body" tone="muted" center>{q ? T.noMatch : T.noneHere}</Txt></View>}
          </View>
        )}
        {h.cohost ? <Txt v="small" testID="cohost-note">{A.cohostNote}</Txt> : null}
        {!h.cohost && !h.mySide ? <View style={{ marginTop: space[4] }}><DeleteEvent id={h.id} title={h.evName} /></View> : null}
      </Screen>
      <GuestSheet id={openId} onClose={() => setOpenId(null)} />
      <MainTabBar active="home" onEvent />
    </View>
  );
}
