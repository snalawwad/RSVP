// GUESTS (host.html #pg-guests): search + Add guest at the top, one 4-way filter (All / Coming / No reply /
// Can't come), whose-side filter behind one button, the "not sent yet" banner as the first row, the list.
// A tap on a guest opens their sheet (details, change by hand, send again, remove).
import { Pressable, View } from 'react-native';
import { useState } from 'react';
import { asciiDigits, searchNames } from '../../lib/names';
import { isUnsent, peopleComing, sideOf, stats } from '../../lib/guests';
import { useApp } from '../../providers/AppProvider';
import { mix, radius, size, space, statusTone } from '../../theme/tokens';
import { Button, IconButton } from '../Button';
import { Field } from '../Field';
import { Icon } from '../Icon';
import { Row, RowList } from '../Row';
import { Screen } from '../Screen';
import { Sheet } from '../Sheet';
import { Tag } from '../Tag';
import { Txt } from '../Txt';
import { GuestSheet } from './GuestSheet';
import { useHost, type Filter } from './HostContext';
import { CountSeg, Meta, usePull } from './parts';
import type { Guest } from '../../lib/api';

export function GuestsTab() {
  const { t, c } = useApp();
  const T = t.host;
  const h = useHost();
  const pull = usePull();
  const [sideOpen, setSideOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const guests = h.guests, p = h.pool, s = stats(p);
  const q = h.query.trim(), qd = asciiDigits(q).replace(/\D/g, '');

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
  const showBanner = !h.cohost && s.unsent.length > 0 && !q && (h.filter === 'all' || h.filter === 'pending');
  const editing = !!openId;

  const row = (g: Guest) => {
    const unsent = isUnsent(g);
    const bits: React.ReactNode[] = [unsent ? <Tag key="s" tone="mute" label={T.notSent} /> : <Tag key="s" tone={statusTone(g.status)} label={T.K[g.status]} />];
    if (g.checked_in_at) bits.push(<Tag key="in" tone="ok" label={T.arrived} />);
    if (g.status === 'yes') bits.push(T.ofPeople(peopleComing(g), g.seats || 1));
    else if (g.status === 'pending') bits.push(h.cw(g.seats || 1));
    else if (g.decline_reason) bits.push(`“${g.decline_reason}”`);
    const rd = g.status === 'pending' && g.sent_at && !g.checked_in_at ? h.remDays(g.id) : null;
    if (rd != null) bits.push(<Txt key="rem" v="small" tone="ink">{T.remAgo(rd)}</Txt>);
    if (!g.phone) bits.push(g.source === 'door' || g.side === 'Door' ? T.atDoor : T.viaLink);
    if (sideOf(g) && h.side === 'all' && !h.mySide) bits.push(sideOf(g) as string);
    const act = h.cohost ? null : unsent ? <Button small kind="secondary" icon="whatsapp" label={T.send} onPress={() => h.startQueue('send', [g.id])} testID={`send-${g.id}`} />
      : g.phone && g.status === 'pending' && !g.checked_in_at ? <Button small kind="quiet" icon="bell" label={T.remind} onPress={() => h.startQueue('remind', [g.id])} testID={`remind-${g.id}`} /> : null;
    return (
      <View key={g.id} testID={`g-${g.id}`} style={{ backgroundColor: h.isFresh(g.id) ? c.okBg : undefined }}>
        <Pressable accessibilityRole={h.cohost ? undefined : 'button'} accessibilityLabel={g.name} disabled={h.cohost} onPress={() => setOpenId(g.id)} testID={`open-${g.id}`}
          style={({ pressed }) => ({ minHeight: act ? 56 : 68, paddingTop: 10, paddingBottom: act ? 0 : 10, paddingHorizontal: space[4], flexDirection: 'row', alignItems: 'center', gap: space[3],
            backgroundColor: pressed ? mix(c.card, c.ink, 0.08) : 'transparent' })}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt v="name" numberOfLines={1}>{g.name}</Txt>
            <Meta bits={bits} />
          </View>
          {h.cohost ? null : <Icon name="chev" color={c.muted} />}
        </Pressable>
        {act ? <View style={{ paddingHorizontal: space[4], marginTop: space[2], marginBottom: space[3] }}>{act}</View> : null}
      </View>
    );
  };

  return (
    <Screen edges={['left', 'right']} bottom={96} gap={10} {...pull} testID="host-guests">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <Txt v="label" tone="muted" style={{ flex: 1 }} testID="g-sum">{guests.length ? T.gSum(p.length, s.invited) : ''}</Txt>
        {/* filled plum only for one action: "Add guest" when nothing is waiting to be sent */}
        {h.cohost ? null : <Button small kind={s.unsent.length || editing ? 'secondary' : 'primary'} icon="plus" label={T.addGuestBtn} onPress={() => h.openAdd(false)} testID="add-guest" />}
      </View>
      <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Field search value={h.query} onChangeText={h.setQuery} placeholder={T.searchPh} accessibilityLabel={T.search} autoCorrect={false} testID="g-search" />
        </View>
        {!h.mySide && h.sides.length >= 2 ? <IconButton icon="list" label={T.sideBtn} dot={h.side !== 'all'} onPress={() => setSideOpen(true)} testID="side-btn" /> : null}
      </View>
      {h.mySide ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}><Icon name="list" sm /><Txt v="label">{T.yourList(h.mySide)}</Txt></View>
      ) : h.side !== 'all' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }} testID="side-on">
          <Txt v="label" style={{ flex: 1 }}>{T.sideOn(h.side)}</Txt>
          <Button small kind="quiet" label={T.showAll} onPress={() => h.setSide('all')} testID="side-clear" />
        </View>
      ) : null}
      {guests.length ? (
        <CountSeg<Filter> label={T.filterBy} testID="filter" value={q ? 'all' : h.filter} onChange={(k) => { h.setFilter(k); h.setQuery(''); }}
          options={(['all', 'yes', 'pending', 'no'] as Filter[]).map((k) => ({ key: k, label: T.K[k], count: N[k], a11y: `${T.K[k]}: ${h.cw(N[k], 'guest')}` }))} />
      ) : null}
      {q ? <Txt v="small" testID="results">{T.results(list.length)}</Txt> : null}

      {h.cohost ? <Txt v="small" testID="cohost-note">{t.a.cohostNote}</Txt> : null}
      {!h.guestsLoaded ? null : !guests.length && h.cohost ? (
        <Txt v="body" tone="muted" center style={{ paddingVertical: space[5] }}>{T.emptyG}</Txt>
      ) : !guests.length ? (
        <View style={{ gap: 10 }} testID="ways">
          <Txt v="name" center style={{ paddingTop: space[5], paddingBottom: 6 }}>{T.emptyG}</Txt>
          <RowList>
            <Row start={<Icon name="list" lg color={c.muted} />} title={T.wPaste} sub={T.wPasteP} onPress={() => h.openAdd(true)} testID="way-paste" />
            <Row start={<Icon name="person" lg color={c.muted} />} title={T.wOne} sub={T.wOneP} onPress={() => h.openAdd(false)} testID="way-one" />
          </RowList>
        </View>
      ) : (
        <View testID="g-list" style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: radius.l, overflow: 'hidden' }}>
          {showBanner ? (
            <View testID="unsent-banner" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: 14, backgroundColor: c.waitBg }}>
              <View style={{ flexGrow: 1, flexBasis: 200, minWidth: 0 }}>
                <Txt v="button">{T.toSendT(s.unsent.length)}</Txt>
                <Txt v="small" tone="ink">{T.toSendP}</Txt>
              </View>
              <Button small kind={editing ? 'secondary' : 'primary'} icon="whatsapp" label={T.nSendB(s.unsent.length)} testID="banner-send"
                onPress={() => h.startQueue('send', s.unsent.map((g) => g.id))} />
            </View>
          ) : null}
          {list.length ? list.map((g, i) => (
            <View key={g.id} style={i || showBanner ? { borderTopWidth: 1, borderTopColor: c.line } : undefined}>{row(g)}</View>
          )) : (
            <View style={{ padding: space[5], borderTopWidth: showBanner ? 1 : 0, borderTopColor: c.line }}><Txt v="body" tone="muted" center>{q ? T.noMatch : T.noneHere}</Txt></View>
          )}
        </View>
      )}

      <Sheet visible={sideOpen} onClose={() => setSideOpen(false)} title={T.sideBtn} closeLabel={T.close} testID="side-sheet">
        <View style={{ gap: space[1] }}>
          {[['all', T.sideAll], ...h.sides.map((x) => [x, x])].map(([k, l]) => {
            const on = k === h.side, n = guests.filter((g) => k === 'all' || g.side === k).length;
            return (
              <Row key={k} title={l} selected={on} end={<Txt v="small">{h.cw(n, 'guest')}</Txt>} testID={`side-${k}`}
                onPress={() => { h.setSide(k); setSideOpen(false); }}
                style={on ? { borderWidth: 2, borderColor: c.ink, borderRadius: radius.m, minHeight: size.row } : { borderWidth: 2, borderColor: 'transparent', borderRadius: radius.m }} />
            );
          })}
        </View>
      </Sheet>
      <GuestSheet id={openId} onClose={() => setOpenId(null)} />
    </Screen>
  );
}
