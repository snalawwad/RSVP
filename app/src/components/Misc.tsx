// Small pieces: EmptyState, MeterBar, Kicker, Divider, Busy.
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useApp } from '../providers/AppProvider';
import { space, toneColors, type Tone } from '../theme/tokens';
import { ArchMark } from './Icon';
import { Txt } from './Txt';

/** Nothing here yet: a title, a line, and at most one action. */
export function EmptyState({ title, body, action, mark = true, testID }: { title: string; body?: string; action?: ReactNode; mark?: boolean; testID?: string }) {
  return (
    <View testID={testID} style={{ alignItems: 'center', paddingVertical: space[8], paddingHorizontal: space[4], gap: space[3] }}>
      {mark ? <ArchMark size={34} /> : null}
      <Txt v="title" center>{title}</Txt>
      {body ? <Txt v="body" tone="muted" center>{body}</Txt> : null}
      {action ? <View style={{ alignSelf: 'stretch', marginTop: space[2] }}>{action}</View> : null}
    </View>
  );
}

/** Coloured split bar (web .meter-bar): parts in order, the rest is empty. 10px, 3px gaps, round ends. */
export function MeterBar({ parts, total }: { parts: { tone: Exclude<Tone, 'mute'>; value: number }[]; total: number }) {
  const { c } = useApp();
  const sum = parts.reduce((a, p) => a + p.value, 0);
  const rest = Math.max(0, total - sum);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', gap: 3, height: 10 }}>
      {parts.filter((p) => p.value > 0).map((p, i) => <View key={i} style={{ flexGrow: p.value, flexBasis: 0, borderRadius: 999, backgroundColor: toneColors(c, p.tone).mark }} />)}
      {rest > 0 || !sum ? <View style={{ flexGrow: rest || 1, flexBasis: 0, borderRadius: 999, backgroundColor: c.surface }} /> : null}
    </View>
  );
}

/** A plain small label above a group (web .kicker): 14px, semibold, muted. */
export function Kicker({ children }: { children: ReactNode }) {
  return <Txt v="label" tone="muted">{children}</Txt>;
}

export function Divider() {
  const { c } = useApp();
  return <View style={{ height: 1, backgroundColor: c.line }} />;
}

/** A centred spinner in plum. */
export function Busy() {
  const { c } = useApp();
  return <View style={{ paddingVertical: space[8], alignItems: 'center' }}><ActivityIndicator color={c.plum} /></View>;
}
