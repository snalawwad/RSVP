// Filter chips (web .fchip) and segmented controls (web .seg / colour switch).
// Selected = dark outline, never plum.
import type { ReactNode } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { haptics } from '../lib/haptics';
import { useApp } from '../providers/AppProvider';
import { gutter, radius, size, space, toneColors, type Tone } from '../theme/tokens';
import { PressScale } from './Press';
import { Txt } from './Txt';

/** A filter chip: optional tone dot, bold count, label. 44 tall. */
export function FilterChip({ label, count, tone, selected, onPress, accessibilityLabel, testID }: {
  label: string; count?: number; tone?: Tone; selected?: boolean; onPress: () => void; accessibilityLabel?: string; testID?: string;
}) {
  const { c } = useApp();
  return (
    <PressScale kind="chip" testID={testID} accessibilityRole="button" accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? (count != null ? `${label}: ${count}` : label)}
      onPress={() => { haptics.tap(); onPress(); }}
      style={{
        minHeight: size.target, paddingHorizontal: 14 - (selected ? 1 : 0), borderRadius: radius.pill,
        borderWidth: selected ? 2 : 1, borderColor: selected ? c.ink : c.line, backgroundColor: c.card,
        flexDirection: 'row', alignItems: 'center', gap: space[2],
      }}>
      {tone ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: toneColors(c, tone).mark }} /> : null}
      {count != null ? <Txt v="label" style={{ fontVariant: ['tabular-nums'] }} script="lat">{count}</Txt> : null}
      <Txt v="label" tone="ink">{label}</Txt>
    </PressScale>
  );
}

/** A row of chips: wraps, or scrolls sideways edge to edge (scroll). */
export function ChipRow({ children, scroll, style }: { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }) {
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ marginHorizontal: -gutter }, style]}
        contentContainerStyle={{ paddingHorizontal: gutter, gap: space[2] }}>
        {children}
      </ScrollView>
    );
  }
  return <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }, style]}>{children}</View>;
}

export type SegOption<K extends string> = { key: K; label: string; swatch?: string };
/** Segmented control (web .seg). fill = options share the full width. */
export function Segmented<K extends string>({ options, value, onChange, fill, label, testID }: {
  options: SegOption<K>[]; value: K; onChange: (k: K) => void; fill?: boolean; label?: string; testID?: string;
}) {
  const { c } = useApp();
  return (
    <View testID={testID} accessibilityRole="radiogroup" accessibilityLabel={label}
      style={{ flexDirection: 'row', gap: 2, padding: 3, borderWidth: 1, borderColor: c.line, borderRadius: radius.pill, backgroundColor: c.surface, alignSelf: fill ? 'stretch' : 'flex-start' }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <PressScale key={o.key} kind="chip" accessibilityRole="radio" accessibilityState={{ selected: on, checked: on }} accessibilityLabel={o.label}
            onPress={() => { haptics.tap(); onChange(o.key); }} wrapStyle={fill ? { flex: 1 } : undefined}
            style={{
              minHeight: size.target, paddingHorizontal: 14, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
              backgroundColor: on ? c.card : 'transparent', borderWidth: 1.5, borderColor: on ? c.ink : 'transparent',
            }}>
            {o.swatch ? <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: o.swatch, borderWidth: 1, borderColor: 'rgba(128,128,128,0.45)' }} /> : null}
            <Txt v="label" tone={on ? 'ink' : 'muted'} center>{o.label}</Txt>
          </PressScale>
        );
      })}
    </View>
  );
}
