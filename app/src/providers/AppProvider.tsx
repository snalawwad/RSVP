import type { Session } from '@supabase/supabase-js';
import * as Localization from 'expo-localization';
import * as Updates from 'expo-updates';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { I18nManager, Platform, useColorScheme } from 'react-native';
import { fill, strings, type Lang, type Strings } from '../i18n/strings';
import { supabase } from '../lib/supabase';
import { colors, type Colors, type ThemeName } from '../theme/tokens';

const LANG_KEY = 'app-lang';

function savedLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === 'ar' || v === 'en' ? v : null;
  } catch {
    return null;
  }
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
  theme: ThemeName;
  c: Colors;
  session: Session | null;
  sessionLoaded: boolean;
};

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const scheme = useColorScheme();
  const theme: ThemeName = scheme === 'dark' ? 'dark' : 'light';
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
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ignore */
    }
    setLangState(l);
    syncDirection(l);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ lang, rtl: lang === 'ar', t: strings[lang], f: fill, setLang, theme, c: colors[theme], session, sessionLoaded }),
    [lang, setLang, theme, session, sessionLoaded],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const v = useContext(AppContext);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
