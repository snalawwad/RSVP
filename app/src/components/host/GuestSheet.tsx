// One guest, opened (host.html editorHtml/bindEditor): number and side, why they can't come, their reply and
// "Change their reply" (v2), people on the invitation and how many are coming (−/+), send again, remove (tap twice).
// Like the web, Save compares the form with the guest as they were when the sheet opened, not with the live row:
// a reply that comes in while the sheet is open is never sent back as the old one. If the host hasn't touched
// the form, it follows the new reply; if they have, a note says the guest just replied.
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { overLimit, setExtras, setReply, removeGuest, why, type Guest, type GuestStatus } from '../../lib/api';
import { MAX_PEOPLE, atDoor, peopleComing, sideOf } from '../../lib/guests';
import { haptics } from '../../lib/haptics';
import { showPhone } from '../../lib/phone';
import { useApp } from '../../providers/AppProvider';
import { radius, space } from '../../theme/tokens';
import { Button } from '../Button';
import { Segmented } from '../Chip';
import { useToast } from '../Feedback';
import { Icon } from '../Icon';
import { Sheet } from '../Sheet';
import { Stepper } from '../Stepper';
import { Txt } from '../Txt';
import { useHost } from './HostContext';

type Snap = { id: string; status: GuestStatus; seats: number; cc: number | null };
const snap = (g: Guest): Snap => ({ id: g.id, status: g.status, seats: g.seats || 1, cc: g.confirmed_count ?? null });
const same = (a: Snap, b: Snap) => a.id === b.id && a.status === b.status && a.seats === b.seats && a.cc === b.cc;
const baseCnt = (b: Snap) => (b.status === 'yes' ? (b.cc || b.seats) : b.seats);

export function GuestSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t, c } = useApp();
  const T = t.host;
  const h = useHost();
  const toast = useToast();
  const g = id ? h.guests.find((x) => x.id === id) : null;
  const [st, setSt] = useState<GuestStatus>('pending');
  const [changing, setChanging] = useState(false);
  const [party, setParty] = useState(1);
  const [cnt, setCnt] = useState(1);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // the guest as the form last saw them (host.html bindEditor keeps the guest it opened with)
  const [base, setBase] = useState<Snap | null>(null);
  const [seen, setSeen] = useState<Snap | null>(null);   // the last live row the form has dealt with
  const [news, setNews] = useState<Snap | null>(null);   // a new reply that came in after the host changed the reply
  const fill = (x: Guest) => { const s0 = snap(x); setBase(s0); setSeen(s0); setNews(null); setSt(x.status); setParty(s0.seats); setCnt(baseCnt(s0)); };
  // a fresh form each time a guest opens
  const [idSeen, setIdSeen] = useState<string | null>(null);
  if (id !== idSeen) {
    setIdSeen(id);
    setChanging(false); setArmed(false);
    if (g) fill(g); else { setBase(null); setSeen(null); }
  } else if (g && (!base || base.id !== g.id)) {
    fill(g);   // opened before the list had this guest
  } else if (g && base && seen && !same(seen, snap(g))) {
    // the row changed under the open sheet (the guest replied, someone else saved). What the host hasn't touched
    // follows the new row; what they have touched stays, and a new reply over a changed one gets a note.
    const now = snap(g);
    const replyTouched = changing || st !== base.status || (st === 'yes' && cnt !== baseCnt(base));
    const partyTouched = party !== base.seats;
    setSeen(now);
    setBase({ id: base.id, status: replyTouched ? base.status : now.status, cc: replyTouched ? base.cc : now.cc, seats: partyTouched ? base.seats : now.seats });
    if (!partyTouched) setParty(now.seats);
    if (!replyTouched) { setSt(now.status); setCnt(baseCnt(now)); setNews(null); }
    else if (now.status !== base.status) setNews(now);
  }
  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);

  if (!g) return <Sheet visible={false} onClose={onClose} title=""><View /></Sheet>;
  const side = sideOf(g);

  async function save() {
    if (!g || !base) return;
    setBusy(true);
    // compare with the guest as the form saw them, never with a newer live row (that would undo their reply)
    const extras = party - 1, was = base.status;
    h.selfIds.current.add(g.id);
    if (extras !== base.seats - 1) {
      const r = await setExtras(g.id, extras);
      if (r.error) { setBusy(false); toast(overLimit(r.error) ? T.noPkg : T.cantSave(why(r.error))); haptics.error(); return; }
    }
    // a 'yes' with no stored head count (replied before the upgrade) always gets the count saved
    if (st !== base.status || (st === 'yes' && (base.cc == null || extras !== base.seats - 1 || cnt !== base.cc))) {
      const r = await setReply(g.id, st, st === 'yes' ? Math.min(cnt, party) : null);
      if (r.error) { setBusy(false); toast(T.cantSave(why(r.error))); haptics.error(); return; }
    }
    h.selfIds.current.add(g.id);
    setBusy(false);
    toast(st !== was ? T.replyChanged(T.K[was], T.K[st]) : T.saved);
    onClose();
    h.reload();
  }
  async function remove() {
    if (!g) return;
    if (!armed) {
      setArmed(true); haptics.warn();
      armTimer.current = setTimeout(() => setArmed(false), 3000);
      return;
    }
    const name = g.name;
    const { error } = await removeGuest(g.id);
    if (error) { toast(T.rmErr); return; }
    onClose(); toast(T.removed(name)); h.reload();
  }

  return (
    <Sheet visible onClose={onClose} title={g.name} closeLabel={T.close} testID="guest-sheet">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space[4], rowGap: 6 }}>
        {g.phone ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name="whatsapp" sm color={c.muted} /><Txt v="small" script="lat" style={{ writingDirection: 'ltr' }}>{showPhone(g.phone)}</Txt></View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name={atDoor(g) ? 'door' : 'link'} sm color={c.muted} /><Txt v="small">{atDoor(g) ? T.atDoor : T.viaLink}</Txt></View>
        )}
        {side ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name="list" sm color={c.muted} /><Txt v="small">{side}</Txt></View> : null}
      </View>
      {g.status === 'no' && g.decline_reason ? <Txt v="body">{`“${g.decline_reason}”`}</Txt> : null}
      {news && news.status !== 'pending' ? (
        <View testID="g-news" accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], padding: space[3], borderRadius: radius.m, backgroundColor: news.status === 'yes' ? c.okBg : c.noBg }}>
          <Icon name="bell" sm color={news.status === 'yes' ? c.ok : c.no} />
          <Txt v="body" style={{ flex: 1 }}>{news.status === 'yes' ? T.jYes(g.name, peopleComing(g)) : T.jNo(g.name)}</Txt>
        </View>
      ) : null}

      {h.v2 ? (
        <View style={{ gap: space[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <Txt v="body" testID="reply-now">{T.replyNow(T.K[st])}</Txt>
            {!changing ? <Button small kind="quiet" label={T.changeReply} onPress={() => setChanging(true)} testID="change-reply" /> : null}
          </View>
          {changing ? (
            <Segmented<GuestStatus> fill label={T.reply} value={st} testID="reply-seg"
              onChange={(k) => { setSt(k); if (k === 'yes') setCnt((x) => Math.min(x, party)); }}
              options={(['yes', 'pending', 'no'] as GuestStatus[]).map((k) => ({ key: k, label: T.K[k] }))} />
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap', paddingVertical: space[2], borderTopWidth: 1, borderTopColor: c.line }}>
            <Txt v="body">{T.partyL}</Txt>
            <Stepper value={party} min={1} max={MAX_PEOPLE} label={T.partyL} lessLabel={T.less} moreLabel={T.more} testID="party"
              onChange={(v) => { setParty(v); if (cnt > v) setCnt(v); }} />
          </View>
          {st === 'yes' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap', paddingVertical: space[2], borderTopWidth: 1, borderTopColor: c.line }}>
              <Txt v="body">{T.comingL}</Txt>
              <Stepper value={Math.min(cnt, party)} min={1} max={party} label={T.comingL} lessLabel={T.less} moreLabel={T.more} onChange={setCnt} testID="coming" />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[1] }}>
            <Button small kind="primary" label={T.save} busy={busy} onPress={save} testID="g-save" />
            <Button small kind="quiet" label={T.cancel} onPress={onClose} testID="g-cancel" />
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2], borderTopWidth: 1, borderTopColor: c.line, marginTop: space[2], paddingTop: space[1] }}>
        {g.phone && g.sent_at ? <Button small kind="quiet" icon="env" label={T.resend} onPress={() => { onClose(); h.startQueue('send', [g.id]); }} testID="g-resend" /> : null}
        <View style={{ flex: 1 }} />
        <Button small kind="danger" icon="trash" label={armed ? T.tapRemove : T.remove} onPress={remove} testID="g-remove"
          style={armed ? { backgroundColor: c.noBg, borderRadius: 999 } : undefined} />
      </View>
    </Sheet>
  );
}
