// The event's page (Sama's Figma 24e Event page and 24m Guest added, 22 Nov): no tabs, one page.
// A card with where the replies stand, two cards (Your invite · Your package), then the guest list with search,
// Add, and the four filters. Invitations go out through our team: guests not sent yet show "Sending…" and a
// banner says the team is sending them. Door requests (on the night) show as a red bar that opens the arrivals.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { daysTo, fmtTime, shortDate } from '../../lib/format';
import { isUnsent, peopleComing, sideOf, stats } from '../../lib/guests';
import { asciiDigits, searchNames } from '../../lib/names';
import { useApp } from '../../providers/AppProvider';
import { mix, radius, space } from '../../theme/tokens';
import { AlertBar } from '../AlertBar';
import { Button } from '../Button';
import { Field } from '../Field';
import { Icon, type IconName } from '../Icon';
import { MainTabBar } from '../MainTabBar';
import { Screen } from '../Screen';
import { Txt } from '../Txt';
import { GuestSheet } from './GuestSheet';
import { useHost, type Filter } from './HostContext';
import { CountSeg, usePull } from './parts';
import type { Guest } from '../../lib/api';

const DAY = 86400e3;
/** when our team reminds who hasn't replied: 3 days before the reply-by date, else a week before the event (if still ahead) */
function remindDate(deadline: string | null, starts: string | null) {
  const base = deadline ? new Date(deadline).getTime() - 3 * DAY : starts ? new Date(starts).getTime() - 7 * DAY : 0;
  return base > Date.now() ? new Date(base).toISOString() : null;
}

/** A small card that opens a page (Figma 24e "Your invite" / "Your package"). */
function MiniCard({ icon, title, sub, onPress, testID }: { icon: IconName; title: string; sub: string; onPress?: () => void; testID?: string }) {
  const { c, rtl } = useApp();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={!onPress} testID={testID} style={{ flex: 1 }}>
      {({ pressed }) => (
        <View style={{ flex: 1, minHeight: 96, borderWidth: 1, borderColor: c.line, borderRadius: radius.l, padding: space[4], gap: 6, backgroundColor: pressed ? mix(c.card, c.ink, 0.05) : c.card }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Icon name={icon} sm color={c.plum} />
            {onPress ? <Icon name="chev" sm color={c.ink} flip={rtl} /> : null}
          </View>
          <Txt v="name" style={{ marginTop: 'auto' }}>{title}</Txt>
          <Txt v="small" tone="muted" numberOfLines={2}>{sub}</Txt>
        </View>
      )}
    </Pressable>
  );
}

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
  const { t, c, lang } = useApp();
  const T = t.host, A = t.a;
  const h = useHost();
  const pull = usePull();
  const [openId, setOpenId] = useState<string | null>(null);
  const ev = h.ev;
  const guests = h.guests, p = h.pool, s = stats(p), all = stats(guests);
  const q = h.query.trim(), qd = asciiDigits(q).replace(/\D/g, '');
  if (!ev) return null;

  // ---------- where the replies stand ----------
  const d = daysTo(ev.starts_at);
  const kicker = [ev.starts_at ? `${shortDate(ev.starts_at, lang)} · ${fmtTime(ev.starts_at, lang)}` : '', ev.venue || '', d === 0 ? A.tonightK : ''].filter(Boolean).join(' · ');
  const replied = all.yes.length + all.no.length;
  const head = !guests.length ? T.emptyG : d === 0 ? A.tonightH(all.people) : A.repliedOf(replied, guests.length);
  // the team reminds who hasn't replied a few days before the reply-by date (or a week before the event)
  const remindAt = remindDate(ev.rsvp_deadline ?? null, ev.starts_at);
  const firstSent = guests.map((g) => g.sent_at).filter(Boolean).sort()[0] as string | undefined;
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
  const sending = h.cohost ? [] : s.unsent;

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
        {/* where the replies stand */}
        <View testID="ev-summary" style={{ borderWidth: 1, borderColor: c.line, borderRadius: radius.l, backgroundColor: c.card, padding: space[5], gap: space[2] }}>
          <Txt v="label" tone="plum" style={{ letterSpacing: lang === 'ar' ? 0 : 1, textTransform: 'uppercase' }}>{kicker}</Txt>
          <Txt v="title" style={{ fontSize: 26, lineHeight: 32 }} accessibilityRole="header">{head}</Txt>
          {guests.length ? (
            <>
              <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: c.surface, overflow: 'hidden', marginTop: 2 }}>
                <View style={{ height: 6, width: `${Math.round((replied / guests.length) * 100)}%`, backgroundColor: c.okBar }} />
              </View>
              <Txt v="small" tone="ink">{A.sumLine(all.people, all.no.length, all.pend.length)}</Txt>
              {all.pend.length && remindAt ? <Txt v="small" tone="muted" testID="ev-remind">{A.teamReminds(all.pend.length, shortDate(remindAt, lang))}</Txt> : null}
            </>
          ) : null}
        </View>

        {h.openReqs.length && !h.cohost ? (
          <AlertBar count={h.openReqs.length} icon="door" text={T.reqBar(h.openReqs.length)} go={T.reqGo} onPress={() => router.push(`/event/${h.id}/arrivals` as never)} testID="ev-door-reqs" />
        ) : null}

        <View style={{ flexDirection: 'row', gap: space[3] }}>
          <MiniCard icon="env" title={A.yourInvite} sub={firstSent ? A.sentOn(shortDate(firstSent, lang)) : A.notSentYet} testID="ev-invite"
            onPress={h.cohost ? undefined : () => router.push(`/event/${h.id}/invite` as never)} />
          <MiniCard icon="sparkle" title={A.yourPackage} sub={[pkg, lim ? A.usedOf(guests.length, lim) : ''].filter(Boolean).join(' · ') || A.pkgNone} testID="ev-package"
            onPress={h.cohost ? undefined : () => router.push(`/package/${h.id}` as never)} />
        </View>

        {/* the guest list */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space[3] }}>
          <Txt v="title" accessibilityRole="header" style={{ fontSize: 30, lineHeight: 36 }}>{T.tGuests}</Txt>
          <Txt v="body" tone="muted" testID="g-sum">{A.nInvites(guests.length)}</Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Field search value={h.query} onChangeText={h.setQuery} placeholder={A.searchShort} accessibilityLabel={T.search} autoCorrect={false} testID="g-search" />
          </View>
          {h.cohost ? null : <Button kind="secondary" icon="plus" label={A.addShort} onPress={() => h.openAdd(false)} testID="add-guest" />}
        </View>
        {guests.length ? (
          <CountSeg<Filter> label={T.filterBy} testID="filter" value={q ? 'all' : h.filter} onChange={(k) => { h.setFilter(k); h.setQuery(''); }}
            options={(['all', 'yes', 'pending', 'no'] as Filter[]).map((k) => ({ key: k, label: T.K[k], count: N[k], a11y: `${T.K[k]}: ${h.cw(N[k], 'guest')}` }))} />
        ) : null}

        {sending.length && !q && (h.filter === 'all' || h.filter === 'pending') ? (
          <View testID="sending-banner" style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], borderWidth: 1, borderColor: c.line, borderRadius: radius.l, backgroundColor: c.card, paddingVertical: 14, paddingHorizontal: space[4] }}>
            <Icon name="clock" sm color={c.ink} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="name">{A.teamSending(sending.length)}</Txt>
              <Txt v="small" tone="muted" numberOfLines={1}>{`${h.nameParts(sending, 2).names.join(', ')}${sending.length > 2 ? ` +${sending.length - 2}` : ''} · ${A.withinHour}`}</Txt>
            </View>
            <Txt v="label" tone="plum">{A.sendingWord}</Txt>
          </View>
        ) : null}

        {!h.guestsLoaded ? null : !guests.length ? (
          <Txt v="body" tone="muted" center style={{ paddingVertical: space[5] }} testID="g-empty">{T.emptyG}</Txt>
        ) : (
          <View testID="g-list" style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: radius.l, overflow: 'hidden' }}>
            {list.length ? list.map(row) : <View style={{ padding: space[5] }}><Txt v="body" tone="muted" center>{q ? T.noMatch : T.noneHere}</Txt></View>}
          </View>
        )}
        {h.cohost ? <Txt v="small" testID="cohost-note">{A.cohostNote}</Txt> : null}
      </Screen>
      <GuestSheet id={openId} onClose={() => setOpenId(null)} />
      <MainTabBar active="home" onEvent />
    </View>
  );
}
