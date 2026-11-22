// Native stack header styling that matches the web top bar: page background, hairline, plum back arrow,
// event name in the display face (Fraunces / Noto Naskh Arabic), 18px.
import { useApp } from '../providers/AppProvider';
import { fonts, fs } from '../theme/tokens';

export function useStackOptions() {
  const { c, rtl } = useApp();
  return {
    headerStyle: { backgroundColor: c.bg },
    headerTintColor: c.plum,
    headerShadowVisible: true,   // Figma top bar: a hairline under it
    headerTitleStyle: { fontFamily: rtl ? fonts.arDisplay : fonts.display, fontSize: fs.name, color: c.ink },
    headerBackButtonDisplayMode: 'minimal' as const,
    contentStyle: { backgroundColor: c.bg },
  };
}
