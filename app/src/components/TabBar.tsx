// Bottom tabs (web .tabs): card background, hairline on top, icon + 15px label, plum when selected with a
// 3px plum mark on top. No count badges (counts live on the screen; door requests use the red AlertBar).
//
// Use with Expo Router custom tabs (expo-router/ui):
//   <Tabs>
//     <TabSlot />
//     <TabList asChild>
//       <TabBarFrame>
//         <TabTrigger name="home" href="/event/[id]/home" asChild><TabButton icon="home" label={t.host.tHome} /></TabTrigger>
//         …
//       </TabBarFrame>
//     </TabList>
//   </Tabs>
// TabBarFrame reports its height so toasts and the undo band float above it.
import { forwardRef, type ComponentRef, type ReactNode } from 'react';
import { Pressable, View, type PressableProps, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../providers/AppProvider';
import { fonts, radius, size } from '../theme/tokens';
import { useFloatingOffset } from './Feedback';
import { Icon, type IconName } from './Icon';
import { Txt } from './Txt';

export const TAB_BAR_HEIGHT = size.tabBar + 12; // 56 buttons + 6px padding top and bottom

export const TabBarFrame = forwardRef<ComponentRef<typeof View>, ViewProps & { children?: ReactNode }>(function TabBarFrame({ style, children, ...rest }, ref) {
  const { c } = useApp();
  const insets = useSafeAreaInsets();
  useFloatingOffset(TAB_BAR_HEIGHT + insets.bottom);
  return (
    <View ref={ref} {...rest} accessibilityRole="tablist"
      style={[{ flexDirection: 'row', justifyContent: 'space-around', backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 6, paddingHorizontal: 6, paddingBottom: 6 + insets.bottom }, style]}>
      {children}
    </View>
  );
});

export type TabButtonProps = PressableProps & { icon: IconName; label: string; isFocused?: boolean; /** Figma 24e: a small plum count (door requests) */ badge?: number };

/** One tab. TabTrigger (asChild) passes isFocused and onPress. */
export const TabButton = forwardRef<ComponentRef<typeof View>, TabButtonProps>(function TabButton({ icon, label, isFocused, badge, style: _style, ...props }, ref) {
  const { c, lang } = useApp();
  const col = isFocused ? c.plum : c.muted;
  return (
    <Pressable ref={ref} {...props} accessibilityRole="tab" accessibilityLabel={badge ? `${label} (${badge})` : label} accessibilityState={{ selected: !!isFocused }}
      style={{ flex: 1, maxWidth: 120, minHeight: size.tabBar, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: radius.m }}>
      {isFocused ? <View style={{ position: 'absolute', top: -7, width: 28, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: c.plum }} /> : null}
      <View>
        <Icon name={icon} color={col} />
        {badge ? (
          <View style={{ position: 'absolute', top: -6, end: -10, minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: c.plum, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: c.card }}>
            <Txt v="label" color={c.plumInk} script="lat" style={{ fontSize: 10, lineHeight: 12 }}>{badge > 9 ? '9+' : String(badge)}</Txt>
          </View>
        ) : null}
      </View>
      <Txt v="tab" color={col} center style={[{ fontSize: lang === 'ar' ? 13 : 12, lineHeight: lang === 'ar' ? 20 : 15 }, { fontFamily: lang === 'ar' ? fonts.arSemi : fonts.sansSemi }]}>{label}</Txt>
    </Pressable>
  );
});
