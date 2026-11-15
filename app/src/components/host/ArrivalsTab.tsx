// ARRIVALS (host.html #pg-arrivals): the door's requests, who is here out of who is expected, the last arrival,
// a 4-way view (All / Here / Expected / No reply), search, and the way into the door screen. Live: the list
// updates from the database (realtime, and every 20 seconds).
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { daysTo, dayMonth, fmtTime } from '../../lib/format';
import { peopleComing, sumPeople } from '../../lib/guests';
import { asciiDigits, searchNames } from '../../lib/names';
import { useApp } from '../../providers/AppProvider';
import { radius, space } from '../../theme/tokens';
import { Button } from '../Button';
import { Field } from '../Field';
import { Icon } from '../Icon';
import { Panel } from '../Panel';
import { Row, RowList } from '../Row';
import { Screen } from '../Screen';
import { Tag } from '../Tag';
import { Txt } from '../Txt';
import { useHost } from './HostContext';
import { CountSeg, Hero, Meta, PanelHead, usePull } from './parts';
import { RequestCard } from './Requests';
import type { Guest } from '../../lib/api';

type AK = 'all' | 'in' | 'out' | 'pend';

export function ArrivalsTab() {
  const { t, c, lang } = useApp();
  const T = t.host;
  const h = useHost();
  const pull = usePull();
  const [att, setAtt] = useState<AK>('all');
  const [aq, setAq] = useState('');
  const ev = h.ev;
  if (!ev) return <Screen edges={['left', 'right']}><View /></Screen>;
  const p = h.guests;
  const came = p.filter((g) => g.checked_in_at), out = p.filter((g) => !g.checked_in_at && g.status === 'yes'), pend = p.filter((g) => !g.checked_in_at && g.status === 'pending');
  const ppl = (l: Guest[]) => l.reduce((a, g) => a + (g.checked_in_count || g.seats || 1), 0);
  const here = ppl(came), exp = sumPeople(p.filter((g) => g.status === 'yes'));
  const byTime = (a: Guest, b: Guest) => new Date(b.checked_in_at!).getTime() - new Date(a.checked_in_at!).getTime();
  const last = came.slice().sort(byTime)[0];
  const tot = Math.max(exp, here);
  // nobody here and nobody expected: say that once, not "no one has arrived" twice
  const none = !here && !tot;
  const K: Record<AK, Guest[]> = { all: came.slice().sort(byTime).concat(out, pend), in: came, out, pend };
  const d = daysTo(ev.starts_at);
  const q = aq.trim(), qd = asciiDigits(q).replace(/\D/g, '');
  let list = K[att];
  if (q) { const byName = searchNames(list, q).map((x) => x.item); list = byName.concat(qd.length >= 3 ? list.filter((g) => (g.phone || '').includes(qd) && !byName.includes(g)) : []); }
  const open = h.openReqs;

  return (
    <Screen edges={['left', 'right']} bottom={96} gap={space[3]} {...pull} testID="host-arrivals">
      {open.length ? (
        <Panel testID="req-panel" style={{ borderWidth: 2, borderColor: c.alert }} gap={0}>
          <PanelHead>{T.reqH}</PanelHead>
          <Txt v="body" tone="muted" style={{ marginBottom: space[2] }}>{T.reqP}</Txt>
          {open.map((r, i) => <RequestCard key={r.id} r={r} first={i === 0} />)}
        </Panel>
      ) : null}

      <Panel testID="a-meter">
        <Hero testID="here-hero" parts={none ? { w: T.noOneYet } : T.hereHero(here, tot)} />
        <Txt v="small" testID="last-arr">{last ? T.lastArr(last.name, fmtTime(last.checked_in_at, lang)) : none ? T.noOneExp : T.noOneYet}</Txt>
        <View style={{ height: 10, borderRadius: radius.pill, backgroundColor: c.surface, marginTop: space[2], overflow: 'hidden' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={{ height: 10, borderRadius: radius.pill, backgroundColor: c.okMark, width: `${tot ? Math.min(100, Math.round((here / tot) * 100)) : 0}%` }} />
        </View>
      </Panel>

      {d != null && d > 0 && !came.length ? (
        <View testID="att-note" style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: space[3], borderWidth: 1, borderStyle: 'dashed', borderColor: c.fieldLine, borderRadius: radius.m }}>
          <View style={{ marginTop: 2 }}><Icon name="calendar" sm color={c.muted} /></View>
          <Txt v="small" style={{ flex: 1 }}>{T.attNote(dayMonth(ev.starts_at!, lang))}</Txt>
        </View>
      ) : null}

      <CountSeg<AK> label={T.attBy} testID="att" value={att} onChange={setAtt}
        options={(['all', 'in', 'out', 'pend'] as AK[]).map((k) => ({ key: k, label: T.attK[k] }))} />
      <Field search value={aq} onChangeText={setAq} placeholder={T.searchPh} accessibilityLabel={T.search} autoCorrect={false} testID="a-search" />

      {list.length ? (
        <RowList testID="att-rows">
          {list.map((g) => {
            let meta: React.ReactNode[], end: React.ReactNode = null;
            if (g.checked_in_at) {
              const cnt = g.checked_in_count || g.seats || 1, s = g.status === 'yes' ? peopleComing(g) : g.seats;
              meta = cnt < s ? [<Tag key="p" tone="wait" label={T.partHere(cnt, s)} />] : [<Tag key="i" tone="ok" label={T.attK.in} />, h.cw(cnt)];
              end = <Txt v="label" tone="ok">{fmtTime(g.checked_in_at, lang)}</Txt>;
            } else meta = g.status === 'pending' ? [<Tag key="w" tone="wait" label={T.K.pending} />, h.cw(g.seats || 1)] : [T.expectedN(peopleComing(g))];
            return (
              <Row key={g.id} title={g.name} end={end} testID={`ar-${g.id}`} style={h.isFresh(g.id) ? { backgroundColor: c.okBg } : undefined}>
                <Meta bits={meta} />
              </Row>
            );
          })}
        </RowList>
      ) : <Txt v="body" tone="muted" center style={{ paddingVertical: space[5] }}>{T.attNone}</Txt>}

      <Button kind="quiet" icon="door" label={T.doorScreen} onPress={() => router.push({ pathname: '/door/[id]', params: { id: h.id } })} testID="door-screen" />
    </Screen>
  );
}
