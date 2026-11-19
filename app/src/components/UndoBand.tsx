// The undo band (web .undoband): strong green (or amber/red) bar, 60 tall, text + an outlined Undo button.
// Use it in place (inline, e.g. the door's band slot) or let useUndoBand() float it above the tab bar.
import { View } from 'react-native';
import { useApp } from '../providers/AppProvider';
import { radius, shadow, size, space, toneColors, type Tone } from '../theme/tokens';
import { PressScale } from './Press';
import { Txt } from './Txt';

export function UndoBand({ text, sub, undoLabel, onUndo, tone = 'ok', floating, testID }: {
  text: string; sub?: string; undoLabel?: string | null; onUndo?: () => void; tone?: Exclude<Tone, 'mute'>; floating?: boolean; testID?: string;
}) {
  const { c, theme } = useApp();
  const tc = toneColors(c, tone);
  return (
    <View testID={testID ?? (floating ? 'undoband-floating' : 'undoband')} accessibilityRole="alert" accessibilityLiveRegion="polite"
      style={[{ minHeight: size.undoBand, borderRadius: radius.m, backgroundColor: tc.strong, paddingVertical: 10, paddingHorizontal: space[4], flexDirection: 'row', alignItems: 'center', gap: space[3] },
        floating ? shadow(theme, true) : null]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="button" color={tc.strongInk}>{text}</Txt>
        {sub ? <Txt v="small" color={tc.strongInk}>{sub}</Txt> : null}
      </View>
      {onUndo && undoLabel ? (
        <PressScale kind="chip" accessibilityRole="button" accessibilityLabel={undoLabel} onPress={onUndo} testID={`${testID ?? (floating ? 'undoband-floating' : 'undoband')}-undo`}
          style={({ pressed }) => ({ minHeight: size.target, paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: 1.5, borderColor: tc.strongInk, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? 'rgba(127,127,127,0.18)' : 'transparent' })}>
          <Txt v="button" color={tc.strongInk}>{undoLabel}</Txt>
        </PressScale>
      ) : null}
    </View>
  );
}
