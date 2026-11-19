// The top bar of the launch screens (Figma "Header"): Sama's arch mark and the name Sina / سنة in the display face,
// with an optional button at the end. The arch is the only mark (never a wordmark logo).
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useApp } from '../providers/AppProvider';
import { fonts, space } from '../theme/tokens';
import { ArchMark } from './Icon';
import { Txt } from './Txt';

export function BrandBar({ end, testID }: { end?: ReactNode; testID?: string }) {
  const { t, rtl } = useApp();
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingHorizontal: space[4], paddingVertical: space[2] }}>
      <View accessible accessibilityRole="header" accessibilityLabel={t.appName} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
        <ArchMark size={28} />
        <Txt v="name" style={{ fontFamily: rtl ? fonts.arDisplayBold : fonts.display, fontSize: rtl ? 18 : 16, lineHeight: rtl ? 28 : 20 }}>{t.appName}</Txt>
      </View>
      {end}
    </View>
  );
}

/** The page title (Figma EN/Page title: Fraunces 32, tight; Arabic: Noto Naskh with room for the marks). */
export function PageTitle({ children, sub, testID }: { children: string; sub?: ReactNode; testID?: string }) {
  const { rtl } = useApp();
  return (
    <View style={{ gap: space[2] }} testID={testID}>
      <Txt v="title" accessibilityRole="header" style={{ fontSize: rtl ? 30 : 32, lineHeight: rtl ? 48 : 35, letterSpacing: rtl ? 0 : -0.64 }}>{children}</Txt>
      {typeof sub === 'string' ? <Txt v="body" tone="muted">{sub}</Txt> : sub}
    </View>
  );
}

/** A small uppercase kicker in English (Figma EN/Kicker); in Arabic a plain label (no letter-spacing, no caps). */
export function KickerLine({ children, tone = 'plum', testID }: { children: string; tone?: 'plum' | 'muted'; testID?: string }) {
  const { rtl } = useApp();
  return (
    <Txt v="label" tone={tone} testID={testID} style={rtl ? undefined : { fontSize: 11.5, lineHeight: 15, letterSpacing: 1.2, textTransform: 'uppercase' }}>{children}</Txt>
  );
}
