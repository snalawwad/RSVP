// A guest's invitation in the app (Figma G11 Invite page 139:3738), opened from Your invites:
// the invite, how long to go, the date (Add to calendar: G11b 145:3900 → G11c Added 145:4016), the place
// (Directions), their reply, and the door pass (G11a, once released). Change my reply → G12 (/reply/<token>).
// Same data as invite.html: get_invite_v2 with the guest's own token. Nothing here takes payment.
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { Button, Icon, KickerLine, Screen, Sheet, Txt, useToast } from '../../../components';
import { InfoRow, InviteCard, InviteGate } from '../../../components/guest/parts';
import { comingOf, useInvite } from '../../../components/guest/useInvite';
import { addToPhoneCalendar, openGoogleCalendar, shareDate, type CalEvent } from '../../../lib/calendar';
import { dayMonth, daysTo, fmtTime } from '../../../lib/format';
import { useApp } from '../../../providers/AppProvider';
import { fonts, scriptOf, space } from '../../../theme/tokens';

export default function InvitePage() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t, lang, c } = useApp();
  const A = t.a;
  const toast = useToast();
  const { st, reload } = useInvite(String(token));
  const [cal, setCal] = useState(false);
  const [added, setAdded] = useState(false);
  // back from Change your reply: show the new reply
  const first = useRef(true);
  useFocusEffect(useCallback(() => { if (first.current) { first.current = false; return; } reload(); }, [reload]));

  if (st.kind !== 'ok') {
    return <Screen testID="invite"><Stack.Screen options={{ title: A.yourInvite }} /><InviteGate st={st} onRetry={reload} /></Screen>;
  }
  const inv = st.inv, e = inv.event;
  const name = e.headline || e.title;
  const d = daysTo(e.starts_at);
  const past = d != null && d < 0;
  const n = comingOf(inv);
  const open = e.rsvp_open !== false && !past;
  const canChange = open && (inv.status === 'pending' || e.allow_changes !== false);
  const calEv: CalEvent | null = e.starts_at ? { title: name, starts_at: e.starts_at, ends_at: e.ends_at, venue: e.venue, map_url: e.map_url } : null;
  const replyLine = inv.status === 'yes' ? A.replyComing(n) : inv.status === 'no' ? A.replyNo : A.replyNone;
  const passReady = inv.status === 'yes' && !!inv.pass?.key;
  const passSoon = inv.status === 'yes' && !passReady && 'pass_at' in inv;

  async function phoneCal() {
    if (!calEv) return;
    const r = await addToPhoneCalendar(calEv);
    if (r === 'saved') { setCal(false); setAdded(true); toast(A.calAdded); }
    else if (r === 'denied' || r === 'unavailable') toast(A.calNo);
  }

  const footer = past ? null : (
    <View style={{ gap: space[2] }}>
      {canChange ? (
        <Button block kind={inv.status === 'pending' ? 'primary' : 'secondary'} label={inv.status === 'pending' ? A.replyNow : A.changeReply}
          onPress={() => router.push({ pathname: '/reply/[token]', params: { token: String(token) } })} testID="change-reply" />
      ) : null}
      <Txt v="small" center style={{ fontSize: 12.5 }}>{open ? A.plans(A.theHosts) : inv.status !== 'pending' && e.allow_changes === false ? A.locked : A.closed}</Txt>
    </View>
  );

  return (
    <Screen testID="invite" gap={space[4]} footer={footer}>
      <Stack.Screen options={{ title: A.yourInvites }} />
      <InviteCard inv={inv} />
      <View style={{ gap: space[1] }}>
        <KickerLine>{A.youreInvited}</KickerLine>
        <Txt v="title" accessibilityRole="header" style={{ fontFamily: scriptOf(name) === 'ar' ? fonts.arDisplayBold : fonts.display, fontSize: 28, lineHeight: scriptOf(name) === 'ar' ? 46 : 32 }}>{name}</Txt>
        {d != null ? <Txt v="body" tone="muted" testID="in-days">{A.inDays(d)}</Txt> : null}
      </View>
      <View>
        {e.starts_at ? (
          <InfoRow top icon="calendar" testID="row-date" title={`${dayMonth(e.starts_at, lang)}, ${fmtTime(e.starts_at, lang)}`}
            end={past ? undefined : added ? `${A.added} ✓` : A.addCal} endTone={added ? 'ok' : 'plum'} onEnd={added || past ? undefined : () => setCal(true)} />
        ) : null}
        {e.venue ? (
          <InfoRow top={!e.starts_at} icon="door" testID="row-venue" title={e.venue} sub={e.map_spot || undefined}
            end={e.map_url ? A.directions : undefined} onEnd={e.map_url ? () => Linking.openURL(e.map_url!).catch(() => {}) : undefined} />
        ) : null}
      </View>

      <View style={{ gap: space[2] }}>
        <Txt v="label" tone="muted">{A.yourReply}</Txt>
        <View testID="your-reply" style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.card }}>
          <Icon name={inv.status === 'no' ? 'x' : 'people'} color={inv.status === 'yes' ? c.ok : c.muted} />
          <View style={{ flex: 1 }}>
            <Txt v="button" tone={inv.status === 'yes' ? 'ok' : inv.status === 'no' ? 'no' : 'ink'}>{replyLine}</Txt>
            <Txt v="small">{inv.name}</Txt>
          </View>
        </View>
        {inv.status === 'no' && inv.decline_reason ? <Txt v="small">{`“${inv.decline_reason}”`}</Txt> : null}
      </View>

      {passReady ? (
        <InfoRow top icon="qr" testID="row-pass" title={A.doorPass} sub={A.passFor(n)} end={A.passOpen}
          onEnd={() => router.push({ pathname: '/pass/[token]', params: { token: String(token) } })} />
      ) : passSoon ? (
        <InfoRow top icon="clock" testID="row-pass-soon" title={A.doorPass} sub={A.passLater} />
      ) : null}

      <Sheet visible={cal} onClose={() => setCal(false)} title={A.calH} closeLabel={t.close} testID="cal-sheet">
        {e.starts_at ? <Txt v="small" style={{ marginTop: -space[2] }}>{[`${dayMonth(e.starts_at, lang)}, ${fmtTime(e.starts_at, lang)}`, e.venue].filter(Boolean).join(' · ')}</Txt> : null}
        <View>
          {Platform.OS === 'ios' ? <InfoRow top icon="calendar" title={A.calApple} onPress={phoneCal} testID="cal-phone" /> : null}
          <InfoRow top={Platform.OS !== 'ios'} icon="calendar" title={A.calGoogle} onPress={() => { if (calEv) openGoogleCalendar(calEv); setCal(false); }} testID="cal-google" />
          <InfoRow icon="upload" title={A.calFile} onPress={() => { if (calEv) shareDate(calEv, lang); setCal(false); }} testID="cal-share" />
          <InfoRow icon="bell" title={A.calRemind} end={A.calRemindV} />
        </View>
      </Sheet>
    </Screen>
  );
}
