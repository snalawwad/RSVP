// Add more people (Figma 24l 237:3657; host.html #addSheet): one guest (name, phone number, "Just them" or "They can
// bring people" and how many more, the group, a note such as "Bride’s mum"), or a pasted list (one guest per line). "Add and send invite" goes
// straight into the one-by-one send. Within the package only: when the list is full it says so, with no upsell and no
// link (Apple: the app takes no payment).
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { TextInput, View } from 'react-native';
import { addGuest, addGuests, overLimit, why } from '../../lib/api';
import { MAX_PEOPLE, clampSeats, sumSeats } from '../../lib/guests';
import { haptics } from '../../lib/haptics';
import { normPhone, showPhone } from '../../lib/phone';
import { useApp } from '../../providers/AppProvider';
import { radius, scriptOf, size, space, textStyle } from '../../theme/tokens';
import { textStart } from '../../theme/dir';
import { Button } from '../Button';
import { Choice } from '../Choice';
import { ChipRow, FilterChip, Segmented } from '../Chip';
import { useToast } from '../Feedback';
import { Field } from '../Field';
import { Panel } from '../Panel';
import { Row, RowList } from '../Row';
import { Sheet } from '../Sheet';
import { Stepper } from '../Stepper';
import { Txt } from '../Txt';
import { useHost } from './HostContext';
import { dedupe, fromLines, type Parsed } from './parse';

export function AddSheet() {
  const { t, c, rtl } = useApp();
  const T = t.host;
  const h = useHost();
  const toast = useToast();
  const open = !!h.addSheet;
  const [many, setMany] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [seats, setSeats] = useState(1);
  const [side, setSide] = useState('');
  const [note, setNote] = useState('');
  const [sideAuto, setSideAuto] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<'' | 'save' | 'send' | 'bulk'>('');
  const [paste, setPaste] = useState('');
  const [parsed, setParsed] = useState<Parsed[]>([]);
  const [bad, setBad] = useState<string[]>([]);
  const nameRef = useRef<ComponentRef<typeof TextInput>>(null);

  // opening: one guest or the list; adding while a side is shown fills that side in (and takes it out again once the filter is off)
  const [seen, setSeen] = useState(h.addSheet);
  if (h.addSheet !== seen) {
    setSeen(h.addSheet);
    if (h.addSheet) {
      setMany(h.addSheet.many); setErr('');
      if (!h.addSheet.many && !h.mySide) {
        if (h.side !== 'all' && (!side || sideAuto)) { setSide(h.side); setSideAuto(true); }
        else if (h.side === 'all' && sideAuto) { setSide(''); setSideAuto(false); }
      }
    }
  }
  const one = !!h.addSheet && !h.addSheet.many;
  useEffect(() => { if (!one) return; const tm = setTimeout(() => nameRef.current?.focus(), 250); return () => clearTimeout(tm); }, [one, h.addSheet]);

  const fail = (m: string) => { setErr(m); toast(m); haptics.error(); };
  async function addOne(andSend: boolean) {
    const nm = name.trim(), ph = normPhone(phone), n = clampSeats(seats);
    const gSide = h.mySide || side.trim() || null;
    setErr('');
    if (!nm) { fail(T.typeName); nameRef.current?.focus(); return; }
    if (ph.length < 10) { fail(T.short); return; }
    if (h.ev?.invite_limit != null && sumSeats(h.guests) + n > h.ev.invite_limit) { fail(T.noPkg); return; }
    setBusy(andSend ? 'send' : 'save');
    const { data, error } = await addGuest({ event_id: h.id, name: nm, phone: ph, seats: n, side: gSide, note: note.trim().slice(0, 200) || null });
    setBusy('');
    if (error || !data) { fail(error?.code === '23505' ? T.dupNum : overLimit(error) ? T.noPkg : T.addOneErr); return; }
    h.selfIds.current.add(data.id); h.markFresh(data.id);
    setName(''); setPhone(''); setSide(''); setNote(''); setSideAuto(false); setSeats(1);
    h.closeAdd();
    h.setFilter('all'); h.setQuery('');
    await h.reload();
    h.go('guests');
    if (andSend) h.startQueue('send', [data.id]); else toast(T.added(nm));
  }

  function check() {
    const r = fromLines(paste.split(/\n/));
    const rows = dedupe(r.rows);
    setParsed(rows); setBad(r.bad);
    if (!rows.length) toast(T.lineEach);
  }
  async function addMany() {
    const rows = parsed.map((g) => ({ ...g, event_id: h.id, side: h.mySide || (h.side !== 'all' ? h.side : null) }));
    setBusy('bulk');
    const { data, error } = await addGuests(rows);
    setBusy('');
    if (error) { toast(overLimit(error) ? T.noPkg : T.addErr(why(error) === 'net' ? 'net' : 'other')); return; }
    const added = (data || []).length;
    (data || []).forEach((x) => { h.selfIds.current.add(x.id); h.markFresh(x.id); });
    setParsed([]); setBad([]); setPaste('');
    h.closeAdd(); h.setFilter('all'); h.setQuery('');
    toast(T.addedN(added, rows.length - added));
    await h.reload();
    h.go('guests');
  }

  const sides = h.sides;
  const lim = h.ev?.invite_limit ?? null, usedSeats = sumSeats(h.guests), left = lim == null ? null : Math.max(0, lim - usedSeats);
  const A = t.a;
  if (open && left === 0) {
    return (
      <Sheet visible onClose={h.closeAdd} title={A.addH} closeLabel={T.close} testID="add-sheet">
        <View testID="list-full" style={{ gap: space[2], paddingVertical: space[3] }}>
          <Txt v="title">{A.fullH}</Txt>
          <Txt v="body" tone="muted">{A.fullP(lim ?? 0)}</Txt>
        </View>
        <Button block kind="secondary" label={T.close} onPress={h.closeAdd} testID="full-close" />
      </Sheet>
    );
  }
  return (
    <Sheet visible={open} onClose={h.closeAdd} title={many ? T.bulkH : A.addH} closeLabel={T.close} testID="add-sheet">
      <Segmented fill label={T.bulkH} value={many ? 'list' : 'one'} onChange={(k) => { setMany(k === 'list'); setErr(''); }}
        options={[{ key: 'one', label: T.addOne }, { key: 'list', label: T.addList }]} />
      {!many ? (
        <View style={{ gap: 14 }}>
          <Field ref={nameRef} label={T.name} value={name} onChangeText={setName} autoComplete="off" autoCorrect={false} testID="add-name" />
          <Field label={T.waNum} value={phone} onChangeText={setPhone} ltr keyboardType="phone-pad" placeholder="9XXXXXXX" autoComplete="off" testID="add-phone" />
          <View style={{ gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel={A.canBringQ}>
            <Txt v="label" tone="muted">{A.canBringQ}</Txt>
            <Choice on={seats === 1} title={A.justThem} sub={A.justThemP} onPress={() => setSeats(1)} testID="add-just" />
            <Choice on={seats > 1} title={A.canBring} sub={A.canBringP} onPress={() => setSeats((n) => Math.max(2, n))} testID="add-bring">
              {seats > 1 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap', marginTop: space[3] }}>
                  <Txt v="body" style={{ flexShrink: 1 }}>{A.upTo}</Txt>
                  <Stepper value={seats - 1} min={1} max={MAX_PEOPLE - 1} onChange={(v) => setSeats(v + 1)} label={A.upTo} lessLabel={T.less} moreLabel={T.more} testID="add-seats" />
                </View>
              ) : null}
            </Choice>
          </View>
          {!h.mySide ? (
            <View style={{ gap: space[2] }}>
              <Field label={A.group} value={side} onChangeText={(v) => { setSide(v); setSideAuto(false); }} placeholder={T.sidePh} testID="add-side" />
              {sides.length ? (
                <ChipRow>{sides.map((s) => <FilterChip key={s} label={s} selected={side === s} onPress={() => { setSide(side === s ? '' : s); setSideAuto(false); }} />)}</ChipRow>
              ) : null}
            </View>
          ) : null}
          {/* Figma 24l: under Group. Only the hosts see it (co-hosts and door staff never get it). */}
          <Field label={A.noteOpt} value={note} onChangeText={setNote} placeholder={A.notePh} maxLength={200} testID="add-note" />
          {err ? (
            <View accessibilityRole="alert" testID="add-err" style={{ paddingHorizontal: space[3], paddingVertical: 10, borderRadius: radius.m, backgroundColor: c.noBg }}>
              <Txt v="label" tone="no">{err}</Txt>
            </View>
          ) : null}
          <View style={{ gap: 10, marginTop: 6 }}>
            <Button block kind="primary" icon="whatsapp" label={A.addSend} busy={busy === 'send'} onPress={() => addOne(true)} testID="add-send" />
            <Button block kind="secondary" label={A.addOnly} busy={busy === 'save'} onPress={() => addOne(false)} testID="add-save" />
            {left != null ? <Txt v="small" center testID="add-left">{A.leftAfter(left)}</Txt> : null}
          </View>
        </View>
      ) : (
        <View style={{ gap: space[3] }}>
          <Txt v="small">{T.bulkHelp}</Txt>
          <View style={{ borderRadius: radius.m, borderWidth: 1, borderColor: c.fieldLine, backgroundColor: c.card }}>
            <TextInput multiline value={paste} onChangeText={setPaste} placeholder={T.bulkPh} placeholderTextColor={c.muted} accessibilityLabel={T.bulkH} testID="bulk-paste"
              textAlignVertical="top"
              style={[textStyle('body', paste ? scriptOf(paste) : rtl ? 'ar' : 'lat'), { minHeight: 150, padding: space[3], color: c.ink, textAlign: textStart(rtl), outlineStyle: 'none' } as object]} />
          </View>
          <Button small kind={parsed.length ? 'secondary' : 'primary'} label={T.checkNames} onPress={check} testID="bulk-check" />
          {parsed.length ? (
            <View style={{ gap: space[2] }}>
              <Txt v="body">{T.found(parsed.length)}</Txt>
              <RowList flat>
                {parsed.map((g, i) => <Row key={i} title={g.name} sub={`${showPhone(g.phone)} · ${h.cw(g.seats)}`} />)}
              </RowList>
            </View>
          ) : null}
          {bad.length ? (
            <Panel tone="wait" flat testID="bulk-bad">
              <Txt v="label" tone="wait">{T.badLinesH(bad.length)}</Txt>
              {bad.slice(0, 40).map((l, i) => <Txt key={i} v="small" tone="ink">{`• ${l}`}</Txt>)}
            </Panel>
          ) : null}
          {parsed.length ? (
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Button small kind="primary" label={T.addMine} busy={busy === 'bulk'} onPress={addMany} testID="bulk-add" />
              <Button small kind="quiet" label={T.cancel} onPress={() => { setParsed([]); setBad([]); }} />
            </View>
          ) : null}
        </View>
      )}
      <View style={{ height: size.target / 4 }} />
    </Sheet>
  );
}
