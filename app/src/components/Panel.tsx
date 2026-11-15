// A card (web .panel): surface + border + 18 radius + soft shadow. With a tone: tone background and 2px tone border.
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useApp } from '../providers/AppProvider';
import { radius, shadow, space, toneColors, type Tone } from '../theme/tokens';

export function Panel({ children, tone, flat, padding = space[4], gap = space[2], style, testID }: {
  children: ReactNode; tone?: Exclude<Tone, 'mute'>; flat?: boolean; padding?: number; gap?: number; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  const { c, theme } = useApp();
  const t = tone ? toneColors(c, tone) : null;
  return (
    <View testID={testID} style={[
      { backgroundColor: t ? t.bg : c.card, borderWidth: t ? 2 : 1, borderColor: t ? t.mark : c.line, borderRadius: radius.l, padding, gap },
      flat || t ? null : shadow(theme),
      style,
    ]}>
      {children}
    </View>
  );
}
