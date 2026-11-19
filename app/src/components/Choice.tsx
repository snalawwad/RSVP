// A radio card (Figma G12 "I'm still coming / I can't make it anymore", 17a and 24l "Just them / They can bring people").
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { haptics } from '../lib/haptics';
import { useApp } from '../providers/AppProvider';
import { alpha, space } from '../theme/tokens';
import { Txt } from './Txt';

/** A radio card (Figma G12 / 17a "Just them / They can bring people"). */
export function Choice({ on, title, sub, onPress, children, testID }: { on: boolean; title: string; sub?: string; onPress: () => void; children?: ReactNode; testID?: string }) {
  const { c } = useApp();
  return (
    <View style={{ borderRadius: 14, borderWidth: on ? 2 : 1, borderColor: on ? c.plum : c.line, backgroundColor: c.card, padding: on ? space[4] - 1 : space[4] }}>
      <Pressable accessibilityRole="radio" accessibilityState={{ checked: on, selected: on }} aria-checked={on} accessibilityLabel={title} onPress={() => { haptics.tap(); onPress(); }} testID={testID}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 44 }}>
        <View style={{ flex: 1 }}>
          <Txt v="button" tone={on ? 'plum' : 'ink'}>{title}</Txt>
          {sub ? <Txt v="small">{sub}</Txt> : null}
        </View>
        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: on ? c.plum : c.fieldLine, alignItems: 'center', justifyContent: 'center', boxShadow: on ? `0px 0px 0px 3px ${alpha(c.plum, 0.12)}` : undefined }}>
          {on ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.plum }} /> : null}
        </View>
      </Pressable>
      {children}
    </View>
  );
}

