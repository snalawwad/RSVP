// One guest (Sama's Figma 17a, 22 Nov evening), a page: the name, number and group, the reply in a card (their
// answer in colour, when, and their note), extra guests as a number, the group, and when the invitation went out
// with "Ask our team to resend" (WhatsApp our team). Read-only: our team changes replies and party sizes now.
// Remove guest stays as a small link at the bottom (a host can still take out a mistake).
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { removeGuest, type Guest } from '../../lib/api';
import { links } from '../../lib/config';
import { shortDate } from '../../lib/format';
import { atDoor, isUnsent, sideOf } from '../../lib/guests';
import { haptics } from '../../lib/haptics';
import { showPhone } from '../../lib/phone';
import { useApp } from '../../providers/AppProvider';
import { fonts, mix, scriptOf, space } from '../../theme/tokens';
import { Button } from '../Button';
import { useToast } from '../Feedback';
import { Icon } from '../Icon';
import { Screen } from '../Screen';
import { Txt } from '../Txt';
import { useHost } from './HostContext';

export function GuestPage() {
  const { gid } = useLocalSearchParams<{ gid: string }>();
  const id = gid ? String(gid) : null;
  const onClose = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const { t, c, lang, rtl } = useApp();
  const T = t.host, A = t.a;
  const h = useHost();
  const toast = useToast();
  const g: Guest | null | undefined = id ? h.guests.find((x) => x.id === id) : null;
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);

  if (!g) return <Screen><View /></Screen>;
  const side = sideOf(g);
  const unsent = isUnsent(g);
  const extra = Math.max(0, (g.seats || 1) - 1);
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

  const row = (label: string, sub: string | null, value: string, onPress?: () => void, testID?: string) => (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress} testID={testID}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: pressed ? mix(c.card, c.ink, 0.05) : 'transparent' })}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="body">{label}</Txt>
        {sub ? <Txt v="small" tone="muted">{sub}</Txt> : null}
      </View>
      <Txt v="small" tone="ink" style={{ flexShrink: 1, textAlign: 'right' }}>{value}</Txt>
      {onPress ? <Icon name="chev" sm color={c.ink} flip={rtl} /> : null}
    </Pressable>
  );

  return (
    <Screen gap={space[5]} testID="guest-page">
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
      <View style={{ borderTopWidth: 1, borderTopColor: c.line }}>
        {row(A.extraGuests, A.extraGuestsP, extra ? String(extra) : A.noneWord, undefined, 'g-extra')}
        {side ? row(A.groupL, null, side, undefined, 'g-group') : null}
        {g.sent_at
          ? row(A.inviteSentOn(shortDate(g.sent_at, lang)), null, wa ? A.askResend : '', wa ? () => Linking.openURL(wa).catch(() => {}) : undefined, 'g-resend')
          : g.phone ? row(A.notSentYet, null, A.sendingWord, undefined, 'g-sending') : null}
      </View>
      {h.cohost ? null : (
        <View style={{ alignItems: 'center' }}>
          <Button small kind="danger" icon="trash" label={armed ? T.tapRemove : T.remove} onPress={remove} testID="g-remove"
            style={armed ? { backgroundColor: c.noBg, borderRadius: 999 } : undefined} />
        </View>
      )}
    </Screen>
  );
}
