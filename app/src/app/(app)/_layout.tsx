import { Link, Stack } from 'expo-router';
import { Pressable } from 'react-native';
import { T } from '../../components/ui';
import { useApp } from '../../providers/AppProvider';

export const unstable_settings = { anchor: 'index' };

export default function AppLayout() {
  const { t, c } = useApp();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen
        name="index"
        options={{
          title: t.yourEvents,
          headerRight: () => (
            <Link href="/settings" asChild>
              <Pressable accessibilityRole="button" hitSlop={12}>
                <T v="label" color={c.primary}>{t.settings}</T>
              </Pressable>
            </Link>
          ),
        }}
      />
      <Stack.Screen name="event/[id]" options={{ title: '' }} />
      <Stack.Screen name="door/[id]" options={{ title: t.doorTitle }} />
      <Stack.Screen name="settings" options={{ title: t.settings }} />
      <Stack.Screen name="delete-account" options={{ title: t.deleteAccount }} />
    </Stack>
  );
}
