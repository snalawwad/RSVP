// Your invite (Sama's Figma 24c, 22 Nov): what guests see, how it was sent, the guest page, and "Change the invite".
// On the website a change is paid (10 KWD) and approved before guests see it; the app takes no payment (Apple),
// so here "Change the invite" messages our team on WhatsApp. No price in the app. Delete event sits at the bottom.
// A draft our team sent (a change or a design, status draft_sent) gets a "Review the new version" line (Figma 24p).
import { router } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';
import { needsReview } from '../../lib/api7';
import { dayMon, fmtTime, shortDate } from '../../lib/format';
import { links } from '../../lib/config';
import { publicLink } from '../../lib/links';
import { useApp } from '../../providers/AppProvider';
import { fonts, mix, radius, scriptOf, space } from '../../theme/tokens';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { MainTabBar } from '../MainTabBar';
import { Screen } from '../Screen';
import { Txt } from '../Txt';
import { DeleteEvent } from './DeleteEvent';
import { useHost } from './HostContext';

export function YourInvite() {
  const { t, c, lang, rtl } = useApp();
  const A = t.a;
  const h = useHost();
  const ev = h.ev;
  if (!ev) return null;
  const firstSent = h.guests.map((g) => g.sent_at).filter(Boolean).sort()[0] as string | undefined;
  const name = ev.headline || ev.title;
  const evLang = ev.lang === 'en' ? 'en' : 'ar';
  const when = [ev.event_type && ev.event_type !== 'wedding' ? ev.event_type : '', ev.starts_at ? `${shortDate(ev.starts_at, evLang)}${evLang === 'ar' ? '، ' : ', '}${fmtTime(ev.starts_at, evLang)}` : ''].filter(Boolean).join(' · ');
  const link = ev.public_code ? publicLink(ev.public_code) : '';
  const wa = links.whatsapp(A.changeWa(name));
  const drafts = h.cohost ? [] : (h.asks ?? []).filter(needsReview);
  const ch = h.me?.send_channel; const via = ch === 'sms' ? A.viaSms : ch === 'by_hand' ? A.viaHand : A.viaWa;
  const line = (k: string, v: string, onPress?: () => void, testID?: string) => (
    <Pressable key={testID ?? k} accessibilityRole={onPress ? 'link' : undefined} disabled={!onPress} onPress={onPress} testID={testID}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: pressed ? mix(c.bg, c.ink, 0.04) : 'transparent' })}>
      <Txt v="body" style={{ flex: 1 }}>{k}</Txt>
      <Txt v="small" tone="ink">{v}</Txt>
      {onPress ? <Icon name="chev" sm color={c.ink} flip={rtl} /> : null}
    </Pressable>
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen edges={['left', 'right']} gap={space[5]} testID="your-invite"
        footer={!h.cohost && wa ? <Button kind="primary" big block icon="pen" label={A.changeInvite} onPress={() => Linking.openURL(wa).catch(() => {})} testID="change-invite" /> : undefined}>
        <View style={{ gap: space[2] }}>
          <Txt v="title" accessibilityRole="header">{A.yourInvite}</Txt>
          <Txt v="body" tone="muted">{firstSent ? A.inviteSentP(shortDate(firstSent, lang)) : A.inviteNotSentP}</Txt>
        </View>
        {/* the card guests see (the uploaded design, or the words in the event's style) */}
        <View testID="invite-card" style={{ borderWidth: 1, borderColor: c.line, borderRadius: radius.l, backgroundColor: '#FFFDFB', paddingVertical: space[6], paddingHorizontal: space[5], alignItems: 'center', gap: 6 }}>
          {ev.invite_line ? <Txt v="small" center style={{ color: '#625350' }}>{ev.invite_line}</Txt> : null}
          <Txt v="title" center style={{ color: '#2A1B1D', fontSize: 30, lineHeight: 38, fontFamily: scriptOf(name) === 'ar' ? fonts.arDisplay : fonts.display }}>{name}</Txt>
          {when ? <Txt v="small" center style={{ color: '#625350' }}>{when}</Txt> : null}
        </View>
        <View style={{ borderTopWidth: 1, borderTopColor: c.line }}>
          {line(A.sentBy, via, undefined, 'sent-by')}
          {link ? line(A.guestPage, A.seeAsGuest, () => Linking.openURL(link).catch(() => {}), 'see-guest') : null}
          {drafts.map((r) => line(A.reviewNew, dayMon(r.created_at, lang), () => router.push(`/event/${ev.id}/review/${r.id}` as never), `review-${r.id}`))}
        </View>
        <Txt v="small" tone="muted">{A.changeNote}</Txt>
        {!h.cohost && !h.mySide ? <DeleteEvent id={ev.id} title={name} /> : null}
      </Screen>
      <MainTabBar active="home" onEvent />
    </View>
  );
}
