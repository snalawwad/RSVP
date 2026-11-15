// Toasts and the floating Undo band, shown above the tab bar (and inside an open Sheet, like the web moves
// its toast into the open dialog). Wrap the app once in <FeedbackProvider>; then:
//   const toast = useToast();            toast(t.host.saved)
//   const undoBand = useUndoBand();      const b = undoBand({ text, onUndo, ms: 6000, tone: 'no' }); b.close()
//   useFloatingOffset(height)            a screen with a tab bar says how tall it is, so bands sit above it
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../providers/AppProvider';
import { radius, shadow, space, type Tone } from '../theme/tokens';
import { Txt } from './Txt';
import { useAnimValue } from './Press';
import { UndoBand } from './UndoBand';

export type UndoBandOptions = {
  text: string;
  /** a second line (e.g. "2 still to come") */
  sub?: string;
  /** default t.menu.undo (Undo / تراجع); pass null to show no button (an info band) */
  undoLabel?: string | null;
  /** runs only if Undo is tapped before the band closes */
  onUndo?: () => void;
  /** how long it stays; 0 = until closed. Default 8000 */
  ms?: number;
  tone?: Exclude<Tone, 'mute'>;
};
type Band = UndoBandOptions & { id: number; close: () => void };

type Ctx = {
  toast: (msg: string) => void;
  undoBand: (o: UndoBandOptions) => { close: () => void };
  setFloatingOffset: (px: number) => void;
  sheetOpened: () => void;
  sheetClosed: () => void;
};
const FeedbackCtx = createContext<Ctx | null>(null);
type State = { toast: { id: number; msg: string } | null; band: Band | null; offset: number; sheets: number };
const StateCtx = createContext<State>({ toast: null, band: null, offset: 0, sheets: 0 });

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toastS, setToast] = useState<State['toast']>(null);
  const [band, setBand] = useState<Band | null>(null);
  const [offset, setOffset] = useState(0);
  const [sheets, setSheets] = useState(0);
  const ids = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: ++ids.current, msg });
    if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const undoBand = useCallback((o: UndoBandOptions) => {
    const id = ++ids.current;
    let done = false;
    const close = () => {
      if (done) return; done = true;
      if (bandTimer.current) clearTimeout(bandTimer.current);
      setBand((b) => (b && b.id === id ? null : b));
    };
    if (bandTimer.current) clearTimeout(bandTimer.current);
    setBand({ ...o, id, close });
    const ms = o.ms ?? 8000;
    if (ms) bandTimer.current = setTimeout(close, ms);
    if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(o.text);
    return { close };
  }, []);

  const api = useMemo<Ctx>(() => ({
    toast, undoBand, setFloatingOffset: setOffset,
    sheetOpened: () => setSheets((n) => n + 1), sheetClosed: () => setSheets((n) => Math.max(0, n - 1)),
  }), [toast, undoBand]);
  const state = useMemo(() => ({ toast: toastS, band, offset, sheets }), [toastS, band, offset, sheets]);
  return (
    <FeedbackCtx.Provider value={api}>
      <StateCtx.Provider value={state}>
        {children}
        <FeedbackLayer />
      </StateCtx.Provider>
    </FeedbackCtx.Provider>
  );
}

function useFeedback() {
  const v = useContext(FeedbackCtx);
  if (!v) throw new Error('Wrap the app in <FeedbackProvider>');
  return v;
}
export const useToast = () => useFeedback().toast;
export const useUndoBand = () => useFeedback().undoBand;
export const useSheetTracking = () => { const f = useFeedback(); return { opened: f.sheetOpened, closed: f.sheetClosed }; };
/** A screen with a tab bar (or a sticky footer) says how tall it is; bands and toasts sit 12px above it. */
export function useFloatingOffset(px: number) {
  const { setFloatingOffset } = useFeedback();
  useEffect(() => { setFloatingOffset(px); return () => setFloatingOffset(0); }, [px, setFloatingOffset]);
}

/** Renders the toast and the band. inSheet: the copy inside an open Sheet (the root copy hides meanwhile). */
export function FeedbackLayer({ inSheet }: { inSheet?: boolean }) {
  const { toast, band, offset, sheets } = useContext(StateCtx);
  const { c, theme, reduceMotion, t } = useApp();
  const insets = useSafeAreaInsets();
  const slide = useAnimValue(0);
  const bandId = band?.id;
  useEffect(() => {
    if (!bandId || reduceMotion) { slide.setValue(1); return; }
    slide.setValue(0);
    Animated.timing(slide, { toValue: 1, duration: 250, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [bandId, reduceMotion, slide]);

  if (inSheet ? sheets === 0 : sheets > 0) return null;
  const base = (inSheet ? 0 : offset || insets.bottom) + space[3];
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', start: 0, end: 0, bottom: 0, top: 0 }}>
      {band ? (
        <Animated.View pointerEvents="box-none" style={{
          position: 'absolute', start: space[4], end: space[4], bottom: inSheet ? base + insets.bottom : base, alignItems: 'center',
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
        }}>
          <View style={{ width: '100%', maxWidth: 528 }}>
            <UndoBand text={band.text} sub={band.sub} tone={band.tone} undoLabel={band.undoLabel === null ? null : band.undoLabel ?? t.menu.undo}
              onUndo={band.onUndo ? () => { band.close(); band.onUndo?.(); } : undefined} floating />
          </View>
        </Animated.View>
      ) : null}
      {toast ? (
        <View pointerEvents="none" style={{ position: 'absolute', start: space[4], end: space[4], bottom: (inSheet ? base + insets.bottom : base) + (band ? 72 : 0), alignItems: 'center' }}>
          <View accessibilityRole="alert" accessibilityLiveRegion="polite" testID="toast"
            style={[{ backgroundColor: c.ink, borderRadius: radius.m, paddingHorizontal: space[4], paddingVertical: space[3], maxWidth: 528 }, shadow(theme, true)]}>
            <Txt v="body" color={c.bg} center>{toast.msg}</Txt>
          </View>
        </View>
      ) : null}
    </View>
  );
}
