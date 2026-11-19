// Right-to-left helpers. The whole app is laid out by the language (root View has style.direction), so
// flexDirection 'row', marginStart/End, paddingStart/End flip on their own. Text alignment needs help:
// React Native swaps textAlign left/right only when I18nManager.isRTL (set at launch), the web never does.
import { I18nManager, Platform } from 'react-native';

const swaps = () => Platform.OS !== 'web' && I18nManager.isRTL && I18nManager.getConstants?.().doLeftAndRightSwapInRTL !== false;

/** textAlign value that puts text at the start of the line for this language. */
export const textStart = (rtl: boolean): 'left' | 'right' => {
  const want = rtl ? 'right' : 'left';
  if (!swaps()) return want;
  return want === 'left' ? 'right' : 'left';
};
/** textAlign value that puts text at the end of the line. */
export const textEnd = (rtl: boolean): 'left' | 'right' => (textStart(rtl) === 'left' ? 'right' : 'left');
