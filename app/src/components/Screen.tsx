// A screen: page background, safe areas, 16px sides (web main: 18px 16px 96px), max 760 wide on big screens.
// Scrolls by default. No fades or movement on scroll.
import type { ReactElement, ReactNode } from 'react';
import { RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useApp } from '../providers/AppProvider';
import { gutter, space } from '../theme/tokens';

export type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  /** pull to refresh */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** legacy: a ready RefreshControl element */
  refresh?: ReactElement;
  /** safe-area edges to pad. Default left/right/bottom (a native header or tab bar handles the top). Add 'top' when there is no header. */
  edges?: Edge[];
  /** space under the content (default 40; use 96 above a tab bar) */
  bottom?: number;
  /** stays fixed at the bottom (web .savebar) */
  footer?: ReactNode;
  /** a fixed area above the scrolling content (search box, chips) */
  header?: ReactNode;
  gap?: number;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Screen({ children, scroll = true, onRefresh, refreshing = false, refresh, edges = ['left', 'right', 'bottom'], bottom = space[10], footer, header, gap = space[4], contentStyle, testID }: ScreenProps) {
  const { c } = useApp();
  const inner: StyleProp<ViewStyle> = [{ paddingHorizontal: gutter, paddingTop: 18, paddingBottom: bottom, gap, width: '100%', maxWidth: 760, alignSelf: 'center' }, contentStyle];
  const rc = refresh ?? (onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.plum} colors={[c.plum]} /> : undefined);
  return (
    <SafeAreaView testID={testID} edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      {header ? <View style={{ paddingHorizontal: gutter, paddingTop: space[3], paddingBottom: space[2], gap: space[3], width: '100%', maxWidth: 760, alignSelf: 'center' }}>{header}</View> : null}
      {scroll ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={inner} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="automatic" refreshControl={rc}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
      {footer ? (
        <View style={{ borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.bg, paddingHorizontal: gutter, paddingVertical: space[3], gap: space[2] }}>{footer}</View>
      ) : null}
    </SafeAreaView>
  );
}

/** Centered content (loading, a single message). */
export function Centered({ children }: { children: ReactNode }) {
  const { c } = useApp();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, padding: space[6], gap: space[3] }}>{children}</View>;
}
