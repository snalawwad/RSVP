// Plain list rows (web .rowlist > .row): 64px minimum, start text + end content, hairline between rows.
// A tappable row answers with a background step (no movement).
import { Children, isValidElement, type ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useApp } from '../providers/AppProvider';
import { mix, radius, shadow, size, space } from '../theme/tokens';
import { Icon } from './Icon';
import { Txt } from './Txt';

/** The card that holds rows. Children: <Row/>s (dividers are drawn between them). */
export function RowList({ children, style, flat, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; flat?: boolean; testID?: string }) {
  const { c, theme } = useApp();
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View testID={testID} style={[{ backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: radius.l, overflow: 'hidden' }, flat ? null : shadow(theme), style]}>
      {items.map((ch, i) => (
        <View key={ch.key ?? i} style={i ? { borderTopWidth: 1, borderTopColor: c.line } : undefined}>{ch}</View>
      ))}
    </View>
  );
}

export type RowProps = {
  /** the main line (18px name) — or pass `children` for custom content */
  title?: string;
  /** meta line under the title (14px muted) */
  sub?: string;
  /** content before the title (a dot, an icon) */
  start?: ReactNode;
  /** content at the end (a tag, a count, a small button) */
  end?: ReactNode;
  /** show a chevron at the end (opens something) */
  chevron?: boolean;
  onPress?: () => void;
  selected?: boolean;
  children?: ReactNode;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function Row({ title, sub, start, end, chevron, onPress, selected, children, accessibilityLabel, testID, style }: RowProps) {
  const { c } = useApp();
  const body = (
    <>
      {start}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        {title != null ? <Txt v="name" numberOfLines={2}>{title}</Txt> : null}
        {sub ? <Txt v="small">{sub}</Txt> : null}
        {children}
      </View>
      {end != null || chevron ? (
        <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          {end}
          {chevron ? <Icon name="chev" color={c.muted} sm /> : null}
        </View>
      ) : null}
    </>
  );
  const base: ViewStyle = { minHeight: size.row, paddingVertical: space[3], paddingHorizontal: space[4], flexDirection: 'row', alignItems: 'center', gap: space[3] };
  if (!onPress) return <View testID={testID} style={[base, style]}>{body}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ selected: !!selected }} onPress={onPress}
      style={({ pressed }) => [base, { backgroundColor: pressed ? mix(c.card, c.ink, 0.08) : 'transparent' }, style]}>
      {body}
    </Pressable>
  );
}
