// HOME (host.html #pg-home): the one-line event title, the red door-alert bar, how many are coming (with the
// no-reply names), ONE next step, and the latest replies.
import { View, Pressable } from 'react-native';
import { daysTo, fmtTime, shortDate } from '../../lib/format';
import { atDoor, isUnsent, peopleComing, stats } from '../../lib/guests';
import { useApp } from '../../providers/AppProvider';
import { fonts, mix, scriptOf, size, space, statusTone } from '../../theme/tokens';
import { AlertBar } from '../AlertBar';
import { Button } from '../Button';
import { Icon, type IconName } from '../Icon';
import { Panel } from '../Panel';
import { Row, RowList } from '../Row';
import { Screen } from '../Screen';
import { Dot, Tag } from '../Tag';
import { Txt } from '../Txt';
import { useHost, type Filter } from './HostContext';
import { Hero, Meta, NamesLine, PanelHead, usePull } from './parts';
import { useAgo } from './time';
import type { Guest } from '../../lib/api';

type Step = { k: string; p: React.ReactNode; b: string; icon: IconName; quiet?: boolean; go: () => void; alt?: { b: string; icon: IconName; go: () => void } | null };

export function HomeTab() {
  const { t, c, lang } = useApp();
  const T = t.host;
  const h = useHost();
  const ago = useAgo();
  const ev = h.ev;
  const pull = usePull();
  if (!ev) return <Screen edges={['left', 'right']}><View /></Screen>;
  const guests = h.guests, s = stats(guests);
  const d = daysTo(ev.starts_at);
  const cd = d == null ? '' : T.cd(d);
  const kicker = [ev.starts_at ? `${shortDate(ev.starts_at, lang)} · ${fmtTime(ev.starts_at, lang)}` : '', cd].filter(Boolean).join(' · ');
  const open = h.openReqs;

  const toGuests = (f: Filter) => { h.setFilter(f); h.setQuery(''); h.setSide('all'); h.go('guests'); };

  // ---------- the one next step (host.html nextStep) ----------
  const rem = h.remindList(guests);
  const step: Step = (() => {
    if (!guests.length) return { k: 'add', p: T.nAddP, b: T.nAddB, icon: 'plus', go: () => { h.go('guests'); h.openAdd(true); } };
    if (s.unsent.length && (d == null || d > 0)) return {
      k: 'send', p: <NamesLine v="body" comma={T.comma} line={(nm) => T.nSendP(s.unsent.length, nm)} parts={h.nameParts(s.unsent, rem.length ? 2 : 3)} />,
      b: T.nSendB(s.unsent.length), icon: 'whatsapp', go: () => h.startQueue('send', s.unsent.map((g) => g.id)),
      alt: rem.length ? { b: T.nRemB(rem.length), icon: 'bell', go: () => h.startQueue('remind', rem.map((g) => g.id)) } : null,
    };
    if (d === 0) return { k: 'tonight', p: T.nTonightP(s.people), b: T.nTonightB, icon: 'door', go: () => h.go('arrivals') };
    if (d != null && d < 0) {
      const came = guests.reduce((a, g) => a + (g.checked_in_at ? g.checked_in_count || g.seats || 1 : 0), 0);
      return { k: 'past', p: T.nPastP(came), b: T.nPastB, icon: 'door', go: () => h.go('arrivals') };
    }
    if (rem.length) return { k: 'remind', p: <NamesLine v="body" comma={T.comma} line={(nm) => T.nRemP(rem.length, nm)} parts={h.nameParts(rem)} />, b: T.nRemB(rem.length), icon: 'bell', go: () => h.startQueue('remind', rem.map((g) => g.id)) };
    if (s.pend.some((g) => !g.checked_in_at)) return { k: 'wait', p: T.nWaitP, b: T.nWaitB, icon: 'list', quiet: true, go: () => toGuests('pending') };
    return { k: 'done', p: T.nDoneP(s.people), b: T.nDoneB, icon: 'list', quiet: true, go: () => toGuests('all') };
  })();

  // the no-reply names: invitations that went out first, then the ones not sent yet
  const rank = (g: Guest) => (g.checked_in_at ? 2 : isUnsent(g) ? 1 : 0);
  const waiting = s.pend.slice().sort((a, b) => rank(a) - rank(b));
  const sumRow = (k: 'yes' | 'pending' | 'no', n: number, names?: Guest[]) => (
    <Pressable key={k} testID={`sum-${k}`} accessibilityRole="button" accessibilityLabel={`${T.K[k]}: ${h.cw(n, 'guest')}`} onPress={() => toGuests(k)}
      style={({ pressed }) => ({ minHeight: 52, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: space[3], borderTopWidth: 1, borderTopColor: c.line,
        backgroundColor: pressed ? mix(c.card, c.ink, 0.08) : 'transparent' })}>
      <View style={{ alignSelf: names && names.length ? 'flex-start' : 'center', marginTop: names && names.length ? 6 : 0 }}><Dot tone={statusTone(k)} size={10} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="button">{T.K[k]}</Txt>
        {names && names.length ? <NamesLine v="small" comma={T.comma} line={(nm) => nm} parts={h.nameParts(names, 2)} /> : null}
      </View>
      <Txt v="button" style={{ fontVariant: ['tabular-nums'] }}>{h.cw(n, 'guest')}</Txt>
      <Icon name="chev" sm color={c.muted} />
    </Pressable>
  );

  const latest = guests.filter((g) => g.responded_at && g.status !== 'pending' && !atDoor(g))
    .sort((a, b) => new Date(b.responded_at!).getTime() - new Date(a.responded_at!).getTime()).slice(0, 5);

  return (
    <Screen edges={['left', 'right']} bottom={96} gap={space[3]} {...pull} testID="host-home">
      <View testID="mast">
        <Txt v="title" numberOfLines={1} accessibilityRole="header" testID="mast-title"
          style={{ fontFamily: scriptOf(h.evName) === 'ar' ? fonts.arDisplay : fonts.display, fontSize: 22 }}>{h.evName}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Txt v="label" tone="muted">{kicker}</Txt>
          {h.live ? <Tag tone="ok" label={T.live} /> : null}
        </View>
      </View>

      {open.length ? <AlertBar text={T.reqBar(open.length)} go={T.reqGo} onPress={() => h.go('arrivals')} testID="home-alert" /> : null}

      {guests.length ? (
        <Panel testID="sum" padding={space[4]} gap={0} style={{ paddingBottom: 6 }}>
          <Hero parts={T.hero(s.people)} testID="hero-coming" />
          <Txt v="small" style={{ marginTop: 4, marginBottom: 6 }}>{T.heroOf(s.invited, guests.length)}</Txt>
          <View style={{ marginTop: space[2] }}>
            {sumRow('yes', s.yes.length)}
            {sumRow('pending', s.pend.length, waiting)}
            {sumRow('no', s.no.length)}
          </View>
        </Panel>
      ) : null}

      <Panel testID="next" gap={space[1]}>
        <PanelHead>{T.nextK}</PanelHead>
        <View style={{ marginBottom: 10 }} testID={`next-${step.k}`}>{typeof step.p === 'string' ? <Txt v="body">{step.p}</Txt> : step.p}</View>
        <Button big block kind={step.quiet ? 'secondary' : 'primary'} icon={step.icon} label={step.b} onPress={step.go} testID="next-go" />
        {step.alt ? <Button block kind="secondary" icon={step.alt.icon} label={step.alt.b} onPress={step.alt.go} style={{ marginTop: 10 }} testID="next-alt" /> : null}
      </Panel>

      {latest.length ? (
        <View style={{ gap: 10, marginTop: space[3] }} testID="latest">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Txt v="name" accessibilityRole="header">{T.latestH}</Txt>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {h.newSince ? <><Dot tone="ok" size={8} /><Txt v="label">{T.newN(h.newSince)}</Txt></> : null}
            </View>
            <Button small kind="quiet" label={T.seeAll} onPress={() => toGuests('all')} style={{ minHeight: size.target }} testID="see-all" />
          </View>
          <RowList>
            {latest.map((g) => (
              <Row key={g.id} title={g.name} end={<Txt v="small">{ago(g.responded_at!)}</Txt>}>
                <Meta bits={[<Tag key="t" tone={statusTone(g.status)} label={T.K[g.status]} />, g.status === 'yes' ? h.cw(peopleComing(g)) : null]} />
              </Row>
            ))}
          </RowList>
        </View>
      ) : null}
    </Screen>
  );
}
