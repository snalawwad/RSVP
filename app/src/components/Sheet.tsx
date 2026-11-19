// Bottom sheet (web dialog.sheet): card colour, 18 radius on top, grab bar, title + round close button.
// Slides up once (200ms); appears at once under reduce-motion. Tap the backdrop or Close to close.
import { useEffect, type ReactNode } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../providers/AppProvider';
import { motion, radius, shadow, space } from '../theme/tokens';
import { IconButton } from './Button';
import { FeedbackLayer, useSheetTracking } from './Feedback';
import { useAnimValue } from './Press';
import { Txt } from './Txt';

export function Sheet({ visible, onClose, title, children, footer, closeLabel, testID }: {
  visible: boolean; onClose: () => void; title: string; children: ReactNode;
  /** stays at the bottom of the sheet (actions) */
  footer?: ReactNode;
  closeLabel?: string; testID?: string;
}) {
  const { c, theme, t, reduceMotion, rtl } = useApp();
  const insets = useSafeAreaInsets();
  const y = useAnimValue(0);
  const track = useSheetTracking();
  useEffect(() => {
    if (!visible) return;
    track.opened();
    if (reduceMotion) y.setValue(1);
    else { y.setValue(0); Animated.timing(y, { toValue: 1, duration: motion.panel, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: Platform.OS !== 'web' }).start(); }
    return () => track.closed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, direction: rtl ? 'rtl' : 'ltr' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={closeLabel ?? t.close} onPress={onClose} style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, backgroundColor: c.scrim }} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
          <Animated.View testID={testID} accessibilityViewIsModal
            style={[{
              maxHeight: '88%', width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: c.card,
              borderTopLeftRadius: radius.l, borderTopRightRadius: radius.l, paddingTop: space[2], paddingHorizontal: 18, paddingBottom: 18 + insets.bottom,
              transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }) }],
            }, shadow(theme, true)]}>
            <View style={{ width: 40, height: 4, borderRadius: 9, backgroundColor: c.line, alignSelf: 'center', marginTop: 4, marginBottom: 10 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: space[2] }}>
              <View style={{ flex: 1 }}><Txt v="title">{title}</Txt></View>
              <IconButton icon="x" label={closeLabel ?? t.close} onPress={onClose} testID="sheet-close" />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space[3], paddingBottom: space[1] }}>
              {children}
            </ScrollView>
            {footer ? <View style={{ gap: space[2], paddingTop: space[3] }}>{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
        <FeedbackLayer inSheet />
      </View>
    </Modal>
  );
}
