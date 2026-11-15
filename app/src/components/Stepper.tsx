// − value + (web .stepper): 48px round buttons, 22px number. For "how many people".
import { View } from 'react-native';
import { haptics } from '../lib/haptics';
import { useApp } from '../providers/AppProvider';
import { fs, radius, size } from '../theme/tokens';
import { PressScale } from './Press';
import { Txt } from './Txt';

export function Stepper({ value, min = 1, max, onChange, label, lessLabel, moreLabel, testID }: {
  value: number; min?: number; max: number; onChange: (n: number) => void;
  /** what it counts, for screen readers (t.host.partyL / t.door.howMany) */
  label: string; lessLabel: string; moreLabel: string; testID?: string;
}) {
  const { c } = useApp();
  const btn = (d: -1 | 1) => {
    const off = d < 0 ? value <= min : value >= max;
    return (
      <PressScale kind="chip" accessibilityRole="button" accessibilityLabel={d < 0 ? lessLabel : moreLabel} accessibilityState={{ disabled: off }} disabled={off}
        onPress={() => { haptics.tap(); onChange(Math.max(min, Math.min(max, value + d))); }}
        style={{ width: size.stepper, height: size.stepper, borderRadius: radius.pill, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.35 : 1 }}>
        <Txt v="title" script="lat" center style={{ fontSize: fs.h, lineHeight: fs.h + 4 }}>{d < 0 ? '−' : '+'}</Txt>
      </PressScale>
    );
  };
  return (
    <View testID={testID} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min, max, now: value }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderWidth: 1, borderColor: c.fieldLine, borderRadius: radius.pill, padding: 3, backgroundColor: c.card }}>
      {btn(-1)}
      <Txt v="name" script="lat" center accessibilityLiveRegion="polite" style={{ minWidth: 40, fontSize: fs.h, lineHeight: fs.h + 6, fontVariant: ['tabular-nums'] }}>{value}</Txt>
      {btn(1)}
    </View>
  );
}
