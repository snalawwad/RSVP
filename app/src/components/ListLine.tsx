// One settings-style line (Sama's Figma 24b Account / 24q Support): the label in body 16, the value in muted 15 with a
// small "›" after it, 18px above and below, a hairline under every line but the last of its group.
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useApp } from '../providers/AppProvider';
import { mix, size } from '../theme/tokens';
import { Txt } from './Txt';

export type ListLineProps = {
  label: string; sub?: string | null; value?: string | null; end?: ReactNode;
  onPress?: () => void; last?: boolean; ltrValue?: boolean; valueTone?: 'muted' | 'ink'; testID?: string;
};

export function ListLine({ label, sub, value, end, onPress, last, ltrValue, valueTone = 'muted', testID }: ListLineProps) {
  const { c, rtl } = useApp();
  const tail = [value ? (ltrValue ? `⁦${value}⁩` : value) : '', onPress ? (rtl ? '‹' : '›') : ''].filter(Boolean).join('  ');
  const body = (pressed: boolean) => (
    <View style={{ minHeight: size.target, paddingVertical: sub ? 12 : 16, flexDirection: 'row', alignItems: 'center', gap: 8,
      borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line, backgroundColor: pressed ? mix(c.bg, c.ink, 0.04) : 'transparent' }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="body">{label}</Txt>
        {sub ? <Txt v="small" tone="muted" style={{ fontSize: 13.5 }}>{sub}</Txt> : null}
      </View>
      {end}
      {tail ? <Txt v="body" tone={valueTone} numberOfLines={1} style={{ fontSize: 15, flexShrink: 1 }}>{tail}</Txt> : null}
    </View>
  );
  const a11y = [label, value].filter(Boolean).join(': ');
  if (!onPress) return <View testID={testID} accessible={!end} accessibilityLabel={end ? undefined : a11y}>{body(false)}</View>;
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress}>{({ pressed }) => body(pressed)}</Pressable>;
}

/** The small muted heading over a group of lines (Figma: 14 regular, 10 above). */
export function ListHead({ children }: { children: string }) {
  return <Txt v="small" tone="muted" style={{ marginTop: 10, fontSize: 14 }} accessibilityRole="header">{children}</Txt>;
}
