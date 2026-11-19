// Status label (web .tag) and status dot (web .dot). green = coming/in, amber = waiting, red = can't come.
import { View } from 'react-native';
import { useApp } from '../providers/AppProvider';
import { radius, toneColors, type Tone } from '../theme/tokens';
import { Txt } from './Txt';

export function Tag({ label, tone = 'mute', testID }: { label: string; tone?: Tone; testID?: string }) {
  const { c } = useApp();
  const t = toneColors(c, tone);
  return (
    <View testID={testID} style={{ alignSelf: 'flex-start', borderRadius: radius.s, paddingHorizontal: 9, paddingVertical: 1, backgroundColor: t.bg }}>
      <Txt v="label" color={t.fg}>{label}</Txt>
    </View>
  );
}

export function Dot({ tone = 'mute', size = 12 }: { tone?: Tone; size?: number }) {
  const { c } = useApp();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: toneColors(c, tone).mark }} />;
}
