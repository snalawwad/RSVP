// Buttons (Figma "Button" 5:74). ONE filled plum (primary) per screen; everything else secondary (soft pink fill, plum text),
// quiet (plum text), danger (red text) or refuse (red outline). Pills, 48 tall (small 44, big 56 with 18px text).
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';
import { useApp } from '../providers/AppProvider';
import { mix, radius, size, space } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { PressScale } from './Press';
import { Txt } from './Txt';

export type ButtonKind = 'primary' | 'secondary' | 'quiet' | 'danger' | 'refuse';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  kind?: ButtonKind;
  /** 56 tall, 18px text (the main action on a screen, door check-in) */
  big?: boolean;
  /** 44 tall (inside rows) */
  small?: boolean;
  /** full width */
  block?: boolean;
  icon?: IconName;
  /** shows a spinner and ignores taps (web aria-busy) */
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
};

export function Button({ label, onPress, kind = 'secondary', big, small, block, icon, busy, disabled, style, accessibilityLabel, accessibilityHint, testID }: ButtonProps) {
  const { c } = useApp();
  const look = {
    primary: { bg: c.plum, border: c.plum, fg: c.plumInk },
    secondary: { bg: c.accentSoft, border: c.accentSoft, fg: c.plum },
    quiet: { bg: 'transparent', border: 'transparent', fg: c.plum },
    danger: { bg: 'transparent', border: 'transparent', fg: c.no },
    refuse: { bg: 'transparent', border: c.noMark, fg: c.no },
  }[kind];
  // Figma: a disabled filled button goes grey (not a faded plum)
  const grey = !!disabled && kind === 'primary';
  if (grey) { look.bg = c.line; look.border = c.line; look.fg = c.muted; }
  const off = !!disabled || !!busy;
  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={off}
      onPress={onPress}
      wrapStyle={[block ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' }, style]}
      style={({ pressed }) => ({
        minHeight: big ? size.buttonBig : small ? size.target : size.button,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: look.border,
        backgroundColor: pressed && kind !== 'primary' ? (kind === 'secondary' ? mix(look.bg, c.plum, 0.08) : `${look.fg}14`) : look.bg,
        paddingHorizontal: small ? space[4] : space[5],
        paddingVertical: small ? space[2] : space[2] + 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[2],
        opacity: grey ? 1 : disabled ? 0.45 : busy ? 0.85 : 1,
      })}
    >
      {busy ? <ActivityIndicator size="small" color={look.fg} /> : icon ? <Icon name={icon} color={look.fg} sm={!big} /> : null}
      <View style={{ flexShrink: 1 }}>
        <Txt v={big ? 'buttonBig' : 'button'} color={look.fg} center>{label}</Txt>
      </View>
    </PressScale>
  );
}

/** Round 44px icon button (web .iconbtn / .sheet-x). Needs an accessibilityLabel. dot = amber attention dot. */
export function IconButton({ icon, onPress, label, dot, testID }: { icon: IconName; onPress: () => void; label: string; dot?: boolean; testID?: string }) {
  const { c } = useApp();
  return (
    <PressScale kind="chip" testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4}
      style={{ width: size.target, height: size.target, borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} color={c.plum} />
      {dot ? <View style={{ position: 'absolute', top: 7, end: 7, width: 8, height: 8, borderRadius: 4, backgroundColor: c.waitMark, borderWidth: 2, borderColor: c.card }} /> : null}
    </PressScale>
  );
}
