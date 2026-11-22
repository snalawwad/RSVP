// The logged-in app: a native stack. The home (index) draws its own top bar (arch mark, Sina, Account).
// Account (settings) holds the name, language, colours, help, privacy, terms, log out and delete account.
import { router, Stack } from 'expo-router';
import { Platform, View } from 'react-native';
import { Icon, PressScale, useStackOptions } from '../../components';
import { useApp } from '../../providers/AppProvider';
import { radius, size, space } from '../../theme/tokens';

export const unstable_settings = { anchor: 'index' };

// native headers inset their buttons by themselves; the web header doesn't
const edge = Platform.OS === 'web' ? space[4] : 0;

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
      <Stack.Screen name="index" options={{ title: t.a.yourEvents, headerShown: false }} />
      <Stack.Screen name="event/[id]" options={{ title: '' }} />
      <Stack.Screen name="door/[id]" options={{ title: t.door.title }} />
      <Stack.Screen name="invite/[token]" options={{ title: t.a.yourInvite, ...webBack }} />
      <Stack.Screen name="pass/[token]" options={{ title: t.a.yourInvite, ...webBack }} />
      <Stack.Screen name="reply/[token]" options={{ title: t.a.yourInvite, ...webBack }} />
      <Stack.Screen name="package/[id]" options={{ title: t.a.pkgH, ...webBack }} />
      <Stack.Screen name="settings" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="updates" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="new-event" options={{ headerShown: false }} />
      <Stack.Screen name="help" options={{ title: t.menu.help, ...webBack }} />
      <Stack.Screen name="delete-account" options={{ title: t.deleteAccount, ...webBack }} />
    </Stack>
  );
}
