// The door pass (Figma G11a 40:1183): the event in a plum band, the QR (supabase/migrations/0005, the same link the
// web invite draws), the guest's name, how many people, and the SN code the door can type instead.
// Only shown once the pass is released (0006: the day before at 4 PM Kuwait, by default).
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { EmptyState, PageTitle, Screen, Txt } from '../../../components';
import { InviteGate } from '../../../components/guest/parts';
import { comingOf, useInvite } from '../../../components/guest/useInvite';
import { PassQr, passCode, passLink } from '../../../components/PassQr';
import { fmtTime, shortDate } from '../../../lib/format';
import { useApp } from '../../../providers/AppProvider';
import { fonts, radius, scriptOf, space } from '../../../theme/tokens';

export default function DoorPass() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t, lang, c } = useApp();
  const A = t.a;
  const { st, reload } = useInvite(String(token));
  // the screen stays awake while the pass is up (the door may take a moment)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let off = false;
    import('expo-keep-awake').then((k) => { if (!off) k.activateKeepAwakeAsync('pass').catch(() => {}); }).catch(() => {});
    return () => { off = true; import('expo-keep-awake').then((k) => k.deactivateKeepAwake('pass')).catch(() => {}); };
  }, []);

  if (st.kind !== 'ok') return <Screen testID="pass"><Stack.Screen options={{ title: A.yourInvite }} /><InviteGate st={st} onRetry={reload} /></Screen>;
  const inv = st.inv, e = inv.event, name = e.headline || e.title;
  if (!inv.pass?.key || inv.status !== 'yes') {
    return <Screen testID="pass"><Stack.Screen options={{ title: A.yourInvite }} /><EmptyState title={A.doorPass} body={A.passLater} /></Screen>;
  }
  const when = [e.starts_at ? `${shortDate(e.starts_at, lang)}, ${fmtTime(e.starts_at, lang)}` : '', e.venue].filter(Boolean).join(' · ');
  const code = passCode(inv.pass.code);
  return (
    <Screen testID="pass" gap={space[4]}>
      <Stack.Screen options={{ title: A.yourInvite }} />
      <PageTitle>{A.doorPass}</PageTitle>
      <View style={{ borderRadius: radius.l, overflow: 'hidden', borderWidth: 1, borderColor: c.line, backgroundColor: c.card }}>
        <View style={{ backgroundColor: '#5B0F1D', paddingHorizontal: space[4], paddingVertical: 14, gap: 2 }}>
          <Txt v="name" color="#FDFDFD" style={{ fontFamily: scriptOf(name) === 'ar' ? fonts.arDisplayBold : fonts.display, fontSize: 20 }}>{name}</Txt>
          {when ? <Txt v="small" color="#F7E7E5">{when}</Txt> : null}
        </View>
        <View style={{ alignItems: 'center', paddingVertical: space[5], backgroundColor: '#FFFFFF' }}>
          <PassQr value={passLink(inv.pass.key)} size={232} label={`${A.doorPass}, ${code}`} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space[3], paddingHorizontal: space[4], paddingVertical: 14, borderTopWidth: 1, borderTopColor: c.line }}>
          <View style={{ flex: 1 }}>
            <Txt v="button">{inv.name}</Txt>
            <Txt v="small">{A.passFor(comingOf(inv))}</Txt>
          </View>
          <Txt v="label" tone="muted" script="lat" testID="pass-code" style={{ writingDirection: 'ltr' }}>{code}</Txt>
        </View>
      </View>
      <Txt v="small">{A.passShow}</Txt>
    </Screen>
  );
}
