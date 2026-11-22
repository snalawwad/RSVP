// One guest (Sama's Figma 17a, 22 Nov evening), a page: the name, number and group, the reply in a card (their
// answer in colour, when, and their note), extra guests as a number, the group, and when the invitation went out
// with "Ask our team to resend" (WhatsApp our team). The host can change the extra guests and the group, then
// "Save changes" (Figma footer). The reply itself is the guest's. Remove guest stays as a small link at the bottom.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { removeGuest, setExtras, setGuestSide, why, type Guest } from '../../lib/api';
import { links } from '../../lib/config';
import { dayMon, shortDate } from '../../lib/format';
import { atDoor, isUnsent, MAX_EXTRAS, sideOf } from '../../lib/guests';
import { haptics } from '../../lib/haptics';
import { showPhone } from '../../lib/phone';
import { useApp } from '../../providers/AppProvider';
import { fonts, mix, radius, scriptOf, space } from '../../theme/tokens';
import { Button } from '../Button';
import { Choice } from '../Choice';
import { Field } from '../Field';
import { ListLine } from '../ListLine';
import { Sheet } from '../Sheet';
import { useToast } from '../Feedback';
import { Screen } from '../Screen';
import { Txt } from '../Txt';
import { useHost } from './HostContext';

export function GuestPage() {
  const { gid } = useLocalSearchParams<{ gid: string }>();
  const id = gid ? String(gid) : null;
  const onClose = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const { t, c, lang } = useApp();
  const T = t.host, A = t.a;
  const h = useHost();
  const toast = useToast();
  const g: Guest | null | undefined = id ? h.guests.find((x) => x.id === id) : null;
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);
  const [extrasNew, setExtrasNew] = useState<number | null>(null);
  const [sideNew, setSideNew] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [typed, setTyped] = useState('');
  const [saving, setSaving] = useState(false);

  if (!g) return <Screen><View /></Screen>;
  const side = sideOf(g);
  const unsent = isUnsent(g);
  const extraNow = Math.max(0, (g.seats || 1) - 1);
  const extra = extrasNew ?? extraNow;
  const sideShown = sideNew ?? side;
  const canEdit = !h.cohost;
  const changed = (extrasNew != null && extrasNew !== extraNow) || (sideNew != null && sideNew !== (side || ''));
  const tone = g.status === 'yes' ? 'ok' : g.status === 'no' ? 'no' : 'wait';
  const word = unsent ? A.sendingDots : g.status === 'yes' ? (g.confirmed_count ? T.ofPeople(g.confirmed_count, g.seats || 1) : T.K.yes) : g.status === 'no' ? A.cantShort : A.noReplyYet;
  const wa = links.whatsapp(A.resendWa(g.name, h.evName));
  const who = [g.phone ? `\u2066${showPhone(g.phone).replace(/^(\d{4})(\d{4})$/, '+965 $1 $2')}\u2069` : atDoor(g) ? T.atDoor : T.viaLink, side].filter(Boolean).join(' · ');

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

  async function save() {
    if (!g || !changed || saving) return;
    setSaving(true);
    const r1 = extrasNew != null && extrasNew !== extraNow ? await setExtras(g.id, extrasNew) : { error: null };
    const r2 = !r1.error && sideNew != null && sideNew !== (side || '') ? await setGuestSide(g.id, sideNew.trim() || null) : { error: null };
    setSaving(false);
    if (r1.error || r2.error) { toast(T.cantSave(why(r1.error ?? r2.error))); return; }
    haptics.success(); toast(A.saved); h.reload(); onClose();
  }
  const pickSide = (v: string) => { setSideNew(v); setPicking(false); setTyped(''); };
  const round = (d: -1 | 1) => {
    const off = d < 0 ? extra <= 0 : extra >= MAX_EXTRAS;
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={d < 0 ? T.less : T.more} disabled={off} hitSlop={6}
        onPress={() => { haptics.tap(); setExtrasNew(Math.max(0, Math.min(MAX_EXTRAS, extra + d))); }} testID={d < 0 ? 'g-extra-less' : 'g-extra-more'}
        style={({ pressed }) => ({ width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? mix(c.surface, c.ink, 0.08) : c.surface, opacity: off ? 0.4 : 1 })}>
        <Txt v="name" script="lat" style={{ fontSize: 18, lineHeight: 20 }}>{d < 0 ? '−' : '+'}</Txt>
      </Pressable>
    );
  };

  return (
    <Screen gap={18} testID="guest-page" bottom={space[6]}
      footer={canEdit ? <Button block kind="primary" label={A.saveChanges} onPress={save} busy={saving} disabled={!changed} testID="g-save" /> : undefined}>
      <View style={{ gap: 4 }}>
        <Txt v="title" accessibilityRole="header" style={{ fontFamily: scriptOf(g.name) === 'ar' ? fonts.arDisplay : fonts.display, fontSize: 30, lineHeight: scriptOf(g.name) === 'ar' ? 46 : 36 }}>{g.name}</Txt>
        <Txt v="small" tone="muted" testID="g-who">{who}</Txt>
      </View>
      {/* the reply: in colour, but not a button (Figma 17a) */}
      <View testID="g-reply" style={{ borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, padding: space[4], gap: 4 }}>
        <Txt v="label" tone="muted">{A.replyL}</Txt>
        <Txt v="title" tone={tone} style={{ fontSize: 24, lineHeight: 30 }}>{word}</Txt>
        {g.responded_at && g.status !== 'pending' ? <Txt v="small" tone="muted">{A.repliedOn(shortDate(g.responded_at, lang))}</Txt> : null}
        {g.decline_reason ? <Txt v="body" style={{ fontStyle: 'italic', marginTop: 4 }}>{`“${g.decline_reason}”`}</Txt> : null}
      </View>
      <View>
        <ListLine label={A.extraGuests} sub={A.extraGuestsP} testID="g-extra" valueTone="ink"
          value={canEdit ? null : extra ? String(extra) : A.noneWord}
          end={canEdit ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {round(-1)}<Txt v="body" script="lat" center style={{ minWidth: 18, fontVariant: ['tabular-nums'] }} testID="g-extra-n">{String(extra)}</Txt>{round(1)}
            </View>
          ) : undefined} />
        {sideShown || (canEdit && !h.mySide) ? (
          <ListLine label={A.groupL} value={sideShown || A.notSet} valueTone="ink" testID="g-group"
            onPress={canEdit && !h.mySide ? () => setPicking(true) : undefined} />
        ) : null}
        {g.sent_at
          ? <ListLine label={A.inviteSentOn(dayMon(g.sent_at, lang))} value={wa ? A.askResend : null} valueTone="ink" last
              onPress={wa ? () => Linking.openURL(wa).catch(() => {}) : undefined} testID="g-resend" />
          : g.phone ? <ListLine label={A.notSentYet} value={A.sendingWord} last testID="g-sending" /> : null}
      </View>
      {h.cohost ? null : (
        <View style={{ alignItems: 'flex-start' }}>
          <Button small kind="danger" icon="trash" label={armed ? T.tapRemove : T.remove} onPress={remove} testID="g-remove"
            style={armed ? { backgroundColor: c.noBg, borderRadius: 999 } : undefined} />
        </View>
      )}
      <Sheet visible={picking} onClose={() => setPicking(false)} title={A.changeGroup} closeLabel={t.close} testID="group-sheet"
        footer={<Button block kind="primary" label={A.save} disabled={!typed.trim()} onPress={() => pickSide(typed.trim())} testID="group-save" />}>
        <View style={{ gap: space[2] }}>
          {h.sides.map((x) => <Choice key={x} on={x === sideShown} title={x} onPress={() => pickSide(x)} testID={`group-${x}`} />)}
          <Field label={A.newGroupL} value={typed} onChangeText={setTyped} onSubmitEditing={() => typed.trim() && pickSide(typed.trim())} testID="group-new" />
        </View>
      </Sheet>
    </Screen>
  );
}
