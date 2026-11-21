// OVERVIEW (Figma 24e Event home 151:4081): the date kicker, where the invites stand ("Everyone's invited"), the
// replies so far as a bar, Coming / Can't make it / No reply yet, the door's requests, ONE next step (sending by hand
// stays the fallback), and the latest replies.
// After the event (Figma 27 52:3079, 27a no door 151:4014): who came (or who said yes when the door wasn't used),
// the numbers, "Send a thank-you message" and "Download guest list".
// A co-host sees the numbers only (no sending, no requests).
import { Platform, Pressable, Share, View } from 'react-native';
import { daysTo, fmtTime, shortDate } from '../../lib/format';
import { atDoor, isUnsent, peopleComing, stats } from '../../lib/guests';
import { shareWhatsApp } from '../../lib/links';
import { useApp } from '../../providers/AppProvider';
import { mix, radius, size, space, statusTone } from '../../theme/tokens';
import { AlertBar } from '../AlertBar';
import { KickerLine } from '../Brand';
import { Button } from '../Button';
import { Icon, type IconName } from '../Icon';
import { Panel } from '../Panel';
import { Row, RowList } from '../Row';
import { Screen } from '../Screen';
import { Dot, Tag } from '../Tag';
import { Txt } from '../Txt';
import { useHost, type Filter } from './HostContext';
import { Meta, NamesLine, PanelHead, usePull } from './parts';
import { useAgo } from './time';
import type { Guest } from '../../lib/api';

type Step = { k: string; p: React.ReactNode; b: string; icon: IconName; quiet?: boolean; go: () => void; alt?: { b: string; icon: IconName; go: () => void } | null };

/** The page title of the overview (Figma EN/Page title, a little smaller on the tab). */
function Head({ children, testID }: { children: string; testID?: string }) {
  const { rtl } = useApp();
  return <Txt v="title" accessibilityRole="header" testID={testID} style={{ fontSize: rtl ? 28 : 30, lineHeight: rtl ? 46 : 33, letterSpacing: rtl ? 0 : -0.6 }}>{children}</Txt>;
}

/** One number line (Figma 24e rows): words at the start, the number at the end; opens the guest list on that filter. */
function NumRow({ label, value, tone, onPress, testID, sub }: { label: string; value: string; tone?: 'ok' | 'no' | 'wait'; onPress?: () => void; testID?: string; sub?: React.ReactNode }) {
  const { c } = useApp();
  const inner = (pressed: boolean) => (
    <View style={{ minHeight: 52, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: space[3], borderTopWidth: 1, borderTopColor: c.line, backgroundColor: pressed ? mix(c.bg, c.ink, 0.05) : 'transparent' }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="body">{label}</Txt>
        {sub}
      </View>
      <Txt v="button" tone={tone === 'no' ? 'no' : tone === 'ok' ? 'ok' : tone === 'wait' ? 'wait' : 'ink'} style={{ fontVariant: ['tabular-nums'] }}>{value}</Txt>
      {onPress ? <Icon name="chev" sm color={c.muted} /> : null}
    </View>
  );
  if (!onPress) return <View testID={testID}>{inner(false)}</View>;
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress}>{({ pressed }) => inner(pressed)}</Pressable>;
}

export function HomeTab() {
  const { t, c, lang } = useApp();
  const T = t.host, A = t.a;
  const h = useHost();
  const ago = useAgo();
  const ev = h.ev;
  const pull = usePull();
  if (!ev) return <Screen edges={['left', 'right']}><View /></Screen>;
  const guests = h.guests, s = stats(guests);
  const d = daysTo(ev.starts_at);
  const cd = d == null ? '' : T.cd(d);
  const when = ev.starts_at ? `${shortDate(ev.starts_at, lang)} · ${fmtTime(ev.starts_at, lang)}` : '';
  const open = h.cohost ? [] : h.openReqs;

  const toGuests = (f: Filter) => { h.setFilter(f); h.setQuery(''); h.setSide('all'); h.go('guests'); };

  // ---------- after the event (27 / 27a) ----------
  if (d != null && d < 0) {
    const came = guests.reduce((a, g) => a + (g.checked_in_at ? g.checked_in_count || g.seats || 1 : 0), 0);
    const door = came > 0;
    const sent = guests.filter((g) => g.sent_at || g.status !== 'pending').length;
    const noPeople = s.no.reduce((a, g) => a + (g.seats || 1), 0);
    const csv = () => {
      const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
      const rows = guests.map((g) => [g.name, g.seats || 1, T.K[g.status], peopleComing(g), g.checked_in_at ? g.checked_in_count || g.seats || 1 : 0].map(q).join(','));
      return [A.csvHead, ...rows].join('\n');
    };
    const download = () => {
      const text = csv();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
        a.download = `${ev.title.replace(/[^\w؀-ۿ-]+/g, '-')}-guests.csv`;
        a.click();
        return;
      }
      Share.share({ title: A.download, message: text }).catch(() => {});
    };
    return (
      <Screen edges={['left', 'right']} bottom={96} gap={space[3]} {...pull} testID="host-home"
        footer={h.cohost ? undefined : (
          <View style={{ gap: space[2] }}>
            <Button block kind="primary" icon="whatsapp" label={A.thanks} onPress={() => shareWhatsApp(A.thanksMsg(h.evName))} testID="thanks" />
            <Button block kind="secondary" icon="upload" label={A.download} onPress={download} testID="download" />
          </View>
        )}>
        <View testID="mast" style={{ gap: space[1] }}>
          <KickerLine testID="mast-kicker">{A.doneKick(ev.starts_at ? shortDate(ev.starts_at, lang) : '')}</KickerLine>
          <Head testID="mast-title">{door ? A.came(came) : A.saidYes(s.people)}</Head>
          <Txt v="body" tone="muted">{door ? A.cameP(s.people) : A.noDoorP}</Txt>
        </View>
        <View testID="after" style={{ borderBottomWidth: 1, borderBottomColor: c.line }}>
          <NumRow label={A.invitesSent} value={String(sent)} />
          <NumRow label={A.saidYesL} value={h.cw(s.people)} />
          {door ? <NumRow label={A.cameL} value={h.cw(came)} tone="ok" /> : null}
          <NumRow label={A.couldntL} value={h.cw(noPeople)} />
          <NumRow label={A.noReplyL} value={A.invites(s.pend.length)} />
        </View>
      </Screen>
    );
  }

  // ---------- the one next step (host.html nextStep) ----------
  const rem = h.remindList(guests);
  const step: Step | null = h.cohost ? null : (() => {
    if (!guests.length) return { k: 'add', p: T.nAddP, b: T.nAddB, icon: 'plus', go: () => { h.go('guests'); h.openAdd(true); } };
    if (s.unsent.length && (d == null || d > 0)) return {
      k: 'send', p: <NamesLine v="body" comma={T.comma} line={(nm) => T.nSendP(s.unsent.length, nm)} parts={h.nameParts(s.unsent, rem.length ? 2 : 3)} />,
      b: T.nSendB(s.unsent.length), icon: 'whatsapp', go: () => h.startQueue('send', s.unsent.map((g) => g.id)),
      alt: rem.length ? { b: T.nRemB(rem.length), icon: 'bell', go: () => h.startQueue('remind', rem.map((g) => g.id)) } : null,
    };
    if (d === 0) return { k: 'tonight', p: T.nTonightP(s.people), b: T.nTonightB, icon: 'door', go: () => h.go('arrivals') };
    if (rem.length) return { k: 'remind', p: <NamesLine v="body" comma={T.comma} line={(nm) => T.nRemP(rem.length, nm)} parts={h.nameParts(rem)} />, b: T.nRemB(rem.length), icon: 'bell', go: () => h.startQueue('remind', rem.map((g) => g.id)) };
    if (s.pend.some((g) => !g.checked_in_at)) return { k: 'wait', p: T.nWaitP, b: A.seeGuests, icon: 'list', quiet: true, go: () => toGuests('pending') };
    return { k: 'done', p: T.nDoneP(s.people), b: A.seeGuests, icon: 'list', quiet: true, go: () => toGuests('all') };
  })();

  // the no-reply names: invitations that went out first, then the ones not sent yet
  const rank = (g: Guest) => (g.checked_in_at ? 2 : isUnsent(g) ? 1 : 0);
  const waiting = s.pend.slice().sort((a, b) => rank(a) - rank(b));
  const replied = guests.filter((g) => g.status !== 'pending').length;
  const unsent = s.unsent.length;
  // on the day the headline is about tonight ("Everyone's invited" would be wrong with invites still unsent)
  const headline = !guests.length ? h.evName : d === 0 ? A.tonightH(s.people) : unsent && (d == null || d > 0) ? A.toSend(unsent) : unsent ? h.evName : A.everyone;
  const sub = !guests.length ? '' : unsent ? A.someOutP(guests.length - unsent, guests.length) : A.outP(guests.length, replied);

  const latest = guests.filter((g) => g.responded_at && g.status !== 'pending' && !atDoor(g))
    .sort((a, b) => new Date(b.responded_at!).getTime() - new Date(a.responded_at!).getTime()).slice(0, 5);

  return (
    <Screen edges={['left', 'right']} bottom={96} gap={space[3]} {...pull} testID="host-home">
      <View testID="mast" style={{ gap: space[1] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <KickerLine testID="mast-kicker">{[when, cd].filter(Boolean).join(' · ')}</KickerLine>
          {h.live ? <Tag tone="ok" label={T.live} /> : null}
        </View>
        <Head testID="mast-title">{headline}</Head>
        {sub ? <Txt v="body" tone="muted" testID="mast-sub">{sub}</Txt> : null}
      </View>

      {guests.length ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 8, borderRadius: radius.pill, backgroundColor: c.surface, overflow: 'hidden', marginTop: space[1] }}>
          <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: c.okBar, width: `${Math.round((replied / guests.length) * 100)}%` }} />
        </View>
      ) : null}

      {h.cohost ? <Txt v="small" testID="cohost-note">{A.cohostNote}</Txt> : null}

      {open.length ? <AlertBar text={T.reqBar(open.length)} go={T.reqGo} onPress={() => h.go('arrivals')} testID="home-alert" /> : null}

      {guests.length ? (
        <View testID="sum" style={{ borderBottomWidth: 1, borderBottomColor: c.line }}>
          <NumRow testID="sum-yes" label={A.comingL} value={h.cw(s.people)} tone="ok" onPress={() => toGuests('yes')} />
          <NumRow testID="sum-no" label={A.cantL} value={A.invites(s.no.length)} onPress={() => toGuests('no')} />
          <NumRow testID="sum-pending" label={A.noReplyYet} value={A.invites(s.pend.length)} onPress={() => toGuests('pending')}
            sub={waiting.length ? <NamesLine v="small" comma={T.comma} line={(nm) => nm} parts={h.nameParts(waiting, 2)} /> : undefined} />
        </View>
      ) : null}

      {step ? (
        <Panel testID="next" gap={space[1]} flat style={{ backgroundColor: c.surface, borderColor: c.surface }}>
          <PanelHead>{T.nextK}</PanelHead>
          <View style={{ marginBottom: 10 }} testID={`next-${step.k}`}>{typeof step.p === 'string' ? <Txt v="body">{step.p}</Txt> : step.p}</View>
          <Button block kind={step.quiet ? 'secondary' : 'primary'} icon={step.icon} label={step.b} onPress={step.go} testID="next-go" />
          {step.alt ? <Button block kind="secondary" icon={step.alt.icon} label={step.alt.b} onPress={step.alt.go} style={{ marginTop: 10 }} testID="next-alt" /> : null}
        </Panel>
      ) : null}

      {latest.length ? (
        <View style={{ gap: 10, marginTop: space[3] }} testID="latest">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Txt v="name" accessibilityRole="header">{T.latestH}</Txt>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {h.newSince ? <><Dot tone="ok" size={8} /><Txt v="label">{T.newN(h.newSince)}</Txt></> : null}
            </View>
            <Button small kind="quiet" label={T.seeAll} onPress={() => toGuests('all')} style={{ minHeight: size.target }} testID="see-all" />
          </View>
          <RowList flat>
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
