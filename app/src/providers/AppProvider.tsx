import type { Session } from '@supabase/supabase-js';
import * as Localization from 'expo-localization';
import * as Updates from 'expo-updates';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { I18nManager, Platform } from 'react-native';
import { fill, strings, type Lang, type Strings } from '../i18n/strings';
import { KEYS, kv } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/ThemeProvider';
import type { Colors, ThemeName, ThemePref } from '../theme/tokens';

const LANG_KEY = KEYS.lang;

function savedLang(): Lang | null {
  const v = kv.get(LANG_KEY);
  return v === 'ar' || v === 'en' ? v : null;
}

export function initialLang(): Lang {
  return savedLang() ?? (Localization.getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en');
}

// Native layouts flip only after a restart, so line the direction up with the language at launch.
export function syncDirection(lang: Lang) {
  const rtl = lang === 'ar';
  if (Platform.OS !== 'web' && I18nManager.isRTL !== rtl) {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
    Updates.reloadAsync().catch(() => {
      /* Expo Go or dev without updates: direction applies on next launch */
    });
  }
}

type Ctx = {
  lang: Lang;
  rtl: boolean;
  t: Strings;
  f: typeof fill;
  setLang: (l: Lang) => void;
  /** the colours mode in use (cream / light / dark) */
  theme: ThemeName;
  c: Colors;
  /** what the person picked in Colours ('auto' follows the phone) */
  themePref: ThemePref;
  setThemePref: (p: ThemePref) => void;
  /** the phone asks for less motion */
  reduceMotion: boolean;
  session: Session | null;
  /** the login's email, lower case ('' when logged out) */
  email: string;
  sessionLoaded: boolean;
};

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const { theme, c, pref: themePref, setPref: setThemePref, reduceMotion } = useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    }
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    kv.set(LANG_KEY, l);
    setLangState(l);
    syncDirection(l);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      lang, rtl: lang === 'ar', t: strings[lang], f: fill, setLang, theme, c, themePref, setThemePref, reduceMotion,
      session, email: (session?.user.email ?? '').toLowerCase(), sessionLoaded,
    }),
    [lang, setLang, theme, c, themePref, setThemePref, reduceMotion, session, sessionLoaded],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const v = useContext(AppContext);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
