// Quiet press feedback (web: press sinks 1px and scales to .985 in 90ms, back in 120ms).
// Rows and cards answer with a background step instead (see Row). Nothing moves under reduce-motion.
import { useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useApp } from '../providers/AppProvider';
import { motion } from '../theme/tokens';

/** One Animated.Value for the component's life (react-native-web has no useAnimatedValue). */
export function useAnimValue(initial: number) {
  return useState(() => new Animated.Value(initial))[0];
}

const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
const native = Platform.OS !== 'web';

export type PressScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle> | ((s: { pressed: boolean }) => StyleProp<ViewStyle>);
  /** the outer (moving) wrapper style: use for flex/width/margins */
  wrapStyle?: StyleProp<ViewStyle>;
  /** 'button' = sink 1px + scale .985 · 'chip' = scale .97 */
  kind?: 'button' | 'chip';
  children?: ReactNode | ((s: { pressed: boolean }) => ReactNode);
};

/** A Pressable that sinks slightly while pressed. */
export function PressScale({ style, wrapStyle, kind = 'button', onPressIn, onPressOut, disabled, children, ...rest }: PressScaleProps) {
  const { reduceMotion } = useApp();
  const v = useAnimValue(0);
  const go = (to: number) => Animated.timing(v, { toValue: to, duration: to ? motion.press : motion.out, easing: ease, useNativeDriver: native }).start();
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, kind === 'chip' ? motion.chipScale : motion.pressScale] });
  const ty = v.interpolate({ inputRange: [0, 1], outputRange: [0, kind === 'chip' ? 0 : motion.pressY] });
  return (
    <Animated.View style={[wrapStyle, reduceMotion || disabled ? null : { transform: [{ translateY: ty }, { scale }] }]}>
      <Pressable
        {...rest}
        disabled={disabled}
        onPressIn={(e) => { if (!reduceMotion) go(1); onPressIn?.(e); }}
        onPressOut={(e) => { if (!reduceMotion) go(0); onPressOut?.(e); }}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
