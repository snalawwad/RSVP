// Colours mode: light · dark · auto (follows the phone: dark, else light). Light is the default, like the website. Cream stays for anyone who
// picked it before. Saved on this phone.
// Also tells components whether the phone asks for less motion.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, useColorScheme } from 'react-native';
import { KEYS, kv } from '../lib/storage';
import { colors, type Colors, type ThemeName, type ThemePref } from './tokens';

type ThemeCtx = {
  /** what the person picked ('auto' follows the phone) */
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
  /** the mode in use now */
  theme: ThemeName;
  c: Colors;
  /** the phone asks for less motion: no press movement, no sheet slide */
  reduceMotion: boolean;
};

const Ctx = createContext<ThemeCtx | null>(null);

function savedPref(): ThemePref {
  const v = kv.get(KEYS.theme);
  return v === 'cream' || v === 'light' || v === 'dark' || v === 'auto' ? v : 'light';   // light until someone picks otherwise (matches the website)
}

export function useReduceMotionSetting() {
  const webMq = () => (Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null);
  const [reduce, setReduce] = useState(() => webMq()?.matches ?? false);
  useEffect(() => {
    let alive = true;
    if (Platform.OS === 'web') {
      const mq = webMq();
      if (!mq) return;
      const on = (e: MediaQueryListEvent) => setReduce(e.matches);
      mq.addEventListener?.('change', on);
      return () => mq.removeEventListener?.('change', on);
    }
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setReduce(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduce;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>(savedPref);
  const reduceMotion = useReduceMotionSetting();
  const theme: ThemeName = pref === 'auto' ? (scheme === 'dark' ? 'dark' : 'light') : pref;

  const setPref = useCallback((p: ThemePref) => { kv.set(KEYS.theme, p); setPrefState(p); }, []);

  // web: page background and colour-scheme follow the mode (no white flash behind the app)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.documentElement.style.backgroundColor = colors[theme].bg;
    document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const value = useMemo(() => ({ pref, setPref, theme, c: colors[theme], reduceMotion }), [pref, setPref, theme, reduceMotion]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme must be used inside ThemeProvider');
  return v;
}
