// Small building blocks from the design system: Text, Button, Field, Card, StatusPill, Screen.
import type { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../providers/AppProvider';
import { radius, space, textStyle, type TextVariant } from '../theme/tokens';

export function T({ v = 'body', muted, color, style, children, ...rest }: {
  v?: TextVariant; muted?: boolean; color?: string; style?: StyleProp<TextStyle>; children: ReactNode;
  numberOfLines?: number; accessibilityRole?: 'header' | 'text';
}) {
  const { c, rtl } = useApp();
  return (
    <Text
      {...rest}
      style={[textStyle(v, rtl), { color: color ?? (muted ? c.inkMuted : c.ink), textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' }, style]}
    >
      {children}
    </Text>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'tertiary' | 'outline' | 'danger';

// Every button is a pill. One primary per screen.
export function Button({ label, onPress, kind = 'primary', disabled, loading, style }: {
  label: string; onPress: () => void; kind?: ButtonKind; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useApp();
  const bg = { primary: c.primary, secondary: c.secondary, tertiary: c.tertiary, outline: 'transparent', danger: c.no }[kind];
  const fg = { primary: c.onPrimary, secondary: c.onAccent, tertiary: c.onAccent, outline: c.primary, danger: c.bg }[kind];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [{
        minHeight: 48, borderRadius: radius.pill, paddingHorizontal: space[5], alignItems: 'center', justifyContent: 'center',
        backgroundColor: bg, borderWidth: kind === 'outline' ? 1.5 : 0, borderColor: c.lineControl,
        opacity: off ? 0.45 : pressed ? 0.85 : 1,
      }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <T v="button" color={fg} style={{ textAlign: 'center' }}>{label}</T>}
    </Pressable>
  );
}

export function Field({ label, ...input }: { label: string } & TextInputProps) {
  const { c, rtl } = useApp();
  return (
    <View style={{ gap: space[1] + 2 }}>
      <T v="label" muted>{label}</T>
      <TextInput
        placeholderTextColor={c.inkMuted}
        {...input}
        style={[textStyle('body', rtl), {
          minHeight: 48, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.lineControl, backgroundColor: c.surfaceRaised,
          color: c.ink, paddingHorizontal: space[4], textAlign: rtl ? 'right' : 'left',
        }, input.style]}
      />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useApp();
  return (
    <View style={[{ backgroundColor: c.surfaceRaised, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, padding: space[4], gap: space[2] }, style]}>
      {children}
    </View>
  );
}

export function StatusPill({ kind, label }: { kind: 'ok' | 'wait' | 'no'; label: string }) {
  const { c } = useApp();
  const bg = { ok: c.okSoft, wait: c.waitSoft, no: c.noSoft }[kind];
  const fg = { ok: c.ok, wait: c.wait, no: c.no }[kind];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: space[3], paddingVertical: 3, alignSelf: 'flex-start' }}>
      <T v="label" color={fg}>{label}</T>
    </View>
  );
}

// A screen with the page background, safe areas and 20px sides.
export function Screen({ children, scroll = true, refresh }: { children: ReactNode; scroll?: boolean; refresh?: ReactNode }) {
  const { c } = useApp();
  const inner = { padding: space[5], gap: space[4], paddingBottom: space[10] };
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={inner}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={refresh as never}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  const { c } = useApp();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, padding: space[6] }}>{children}</View>;
}
