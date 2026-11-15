import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { NotoKufiArabic_400Regular, NotoKufiArabic_500Medium, NotoKufiArabic_600SemiBold, NotoKufiArabic_700Bold } from '@expo-google-fonts/noto-kufi-arabic';
import { NotoNaskhArabic_600SemiBold, NotoNaskhArabic_700Bold } from '@expo-google-fonts/noto-naskh-arabic';
import { useFonts } from 'expo-font';
import { LocaleProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FeedbackProvider } from '../components/Feedback';
import { AppProvider, initialLang, syncDirection, useApp } from '../providers/AppProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { fonts, fs } from '../theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});
// Make sure layout direction matches the saved language before anything draws.
syncDirection(initialLang());

function Navigator() {
  const { session, sessionLoaded, c, rtl, theme } = useApp();
  // keep the splash up until we know whether someone is logged in (no flash of the login screen)
  useEffect(() => {
    if (sessionLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [sessionLoaded]);
  if (!sessionLoaded) return null;
  return (
    <LocaleProvider direction={rtl ? 'rtl' : 'ltr'}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      {/* style.direction lays the whole app out right-to-left at once (no restart needed for our own views) */}
      <View style={{ flex: 1, direction: rtl ? 'rtl' : 'ltr', backgroundColor: c.bg }}>
        <FeedbackProvider>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: c.bg },
              headerTintColor: c.plum,
              headerShadowVisible: false,
              headerTitleStyle: { fontFamily: rtl ? fonts.arDisplay : fonts.display, fontSize: fs.name, color: c.ink },
              contentStyle: { backgroundColor: c.bg },
            }}
          >
            <Stack.Protected guard={!!session}>
              {/* the app: events list → host tabs or door mode; Menu, Help, Delete account */}
              <Stack.Screen name="(app)" options={{ headerShown: false }} />
            </Stack.Protected>
            <Stack.Protected guard={!session}>
              <Stack.Screen name="sign-in" options={{ headerShown: false }} />
            </Stack.Protected>
            {/* the UI kit page, only in test builds (EXPO_PUBLIC_KIT=1) and only when logged in */}
            <Stack.Protected guard={!!session && process.env.EXPO_PUBLIC_KIT === '1'}>
              <Stack.Screen name="dev-kit" options={{ headerShown: false }} />
            </Stack.Protected>
          </Stack>
        </FeedbackProvider>
      </View>
    </LocaleProvider>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold,
    Fraunces_600SemiBold,
    NotoKufiArabic_400Regular, NotoKufiArabic_500Medium, NotoKufiArabic_600SemiBold, NotoKufiArabic_700Bold,
    NotoNaskhArabic_600SemiBold, NotoNaskhArabic_700Bold,
  });
  useEffect(() => {
    // fonts failed: show the app anyway (system fonts); otherwise the Navigator hides the splash
    if (error) SplashScreen.hideAsync().catch(() => {});
  }, [error]);
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppProvider>
          <Navigator />
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
