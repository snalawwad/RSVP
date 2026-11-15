// A small buzz on the moments that matter (check-in, approve). expo-haptics ships in Expo Go.
// Nothing on web (the web pages use navigator.vibrate only after a touch; we keep the web build quiet).
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const on = Platform.OS === 'ios' || Platform.OS === 'android';
export const haptics = {
  /** light tap: stepper, chip, segment */
  tap() { if (on) Haptics.selectionAsync().catch(() => {}); },
  /** a check-in or an approval went through */
  success() { if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); },
  /** over the limit, already in */
  warn() { if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); },
  /** a refusal or a failed save */
  error() { if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); },
};
