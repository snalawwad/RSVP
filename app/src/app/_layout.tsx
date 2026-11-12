import { CormorantGaramond_500Medium, CormorantGaramond_600SemiBold } from '@expo-google-fonts/cormorant-garamond';
import { DMSans_400Regular, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { IBMPlexSansArabic_400Regular, IBMPlexSansArabic_600SemiBold } from '@expo-google-fonts/ibm-plex-sans-arabic';
import { MarkaziText_600SemiBold } from '@expo-google-fonts/markazi-text';
import { useFonts } from 'expo-font';
import { LocaleProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, initialLang, syncDirection, useApp } from '../providers/AppProvider';
import { fonts } from '../theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});
// Make sure layout direction matches the saved language before anything draws.
syncDirection(initialLang());

function Navigator() {
  const { session, sessionLoaded, c, rtl, theme } = useApp();
  if (!sessionLoaded) return null;
  return (
    <LocaleProvider direction={rtl ? 'rtl' : 'ltr'}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.primary,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: rtl ? fonts.arabicDisplay : fonts.display, fontSize: 24, color: c.ink },
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </LocaleProvider>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    CormorantGaramond_500Medium, CormorantGaramond_600SemiBold,
    DMSans_400Regular, DMSans_600SemiBold, DMSans_700Bold,
    IBMPlexSansArabic_400Regular, IBMPlexSansArabic_600SemiBold,
    MarkaziText_600SemiBold,
  });
  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Navigator />
      </AppProvider>
    </SafeAreaProvider>
  );
}
