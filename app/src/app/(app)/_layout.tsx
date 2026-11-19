// The logged-in app: a native stack. The events list (index) has the web top bar: the arch mark at the
// start and the Menu button at the end. The Menu (settings) holds Language · Colours · Help · Log out.
import { router, Stack } from 'expo-router';
import { Platform, View } from 'react-native';
import { ArchMark, Icon, PressScale, Txt, useStackOptions } from '../../components';
import { useApp } from '../../providers/AppProvider';
import { radius, size, space } from '../../theme/tokens';

export const unstable_settings = { anchor: 'index' };

// native headers inset their buttons by themselves; the web header doesn't
const edge = Platform.OS === 'web' ? space[4] : 0;

/** The web .menu-btn: a pill with the menu icon and the word Menu. Opens the Menu screen. */
function MenuButton() {
  const { t, c } = useApp();
  return (
    <PressScale kind="chip" testID="menu-btn" accessibilityRole="button" accessibilityLabel={t.menu.menu} onPress={() => router.push('/settings')} hitSlop={4}
      style={{ minHeight: size.target, paddingHorizontal: space[4], borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <Icon name="menu" color={c.ink} />
      <Txt v="label" tone="ink">{t.menu.menu}</Txt>
    </PressScale>
  );
}

/** Web only: the stack's own back arrow is a 30px target there, so Menu, Help and Delete account get a
 *  round 44px one (the kit IconButton look). Native keeps the system back button. */
function BackButton() {
  const { t, c, rtl } = useApp();
  return (
    <View style={{ marginHorizontal: edge }}>
      <PressScale kind="chip" testID="header-back" accessibilityRole="button" accessibilityLabel={t.back} hitSlop={4}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={{ width: size.target, height: size.target, borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="chev" color={c.plum} flip={!rtl} />
      </PressScale>
    </View>
  );
}
const webBack = Platform.OS === 'web' ? { headerLeft: () => <BackButton /> } : {};

export default function AppLayout() {
  const { t } = useApp();
  const stack = useStackOptions();
  return (
    <Stack screenOptions={stack}>
      <Stack.Screen
        name="index"
        options={{
          title: t.yourEvents,
          headerTitle: () => null,
          headerLeft: () => <View accessible accessibilityLabel={t.appName} style={{ marginHorizontal: edge }}><ArchMark size={26} /></View>,
          headerRight: () => <View style={{ marginHorizontal: edge }}><MenuButton /></View>,
        }}
      />
      <Stack.Screen name="event/[id]" options={{ title: '' }} />
      <Stack.Screen name="door/[id]" options={{ title: t.door.title }} />
      <Stack.Screen name="settings" options={{ title: t.menu.menu, ...webBack }} />
      <Stack.Screen name="help" options={{ title: t.menu.help, ...webBack }} />
      <Stack.Screen name="delete-account" options={{ title: t.deleteAccount, ...webBack }} />
    </Stack>
  );
}
