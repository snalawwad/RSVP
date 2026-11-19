// LEGACY: the partner's first building blocks, now drawn with the new kit so the first screens match the web.
// New screens import from './index' (Txt, Button, Panel, Row, …) instead.
import type { ReactNode } from 'react';
import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from 'react-native';
import type { TextVariant } from '../theme/tokens';
import { Button as KitButton } from './Button';
import { Field as KitField } from './Field';
import { Panel } from './Panel';
import { Tag } from './Tag';
import { Txt } from './Txt';

export { Centered, Screen } from './Screen';

type LegacyVariant = 'heading1' | 'heading2' | 'title' | 'body' | 'label' | 'caption' | 'button' | 'stat';
const MAP: Record<LegacyVariant, TextVariant> = { heading1: 'title', heading2: 'title', title: 'name', body: 'body', label: 'label', caption: 'small', button: 'button', stat: 'num' };

export function T({ v = 'body', muted, color, style, children, ...rest }: {
  v?: LegacyVariant; muted?: boolean; color?: string; style?: StyleProp<TextStyle>; children: ReactNode;
  numberOfLines?: number; accessibilityRole?: 'header' | 'text';
}) {
  return <Txt v={MAP[v]} tone={muted ? 'muted' : 'ink'} color={color} style={style} {...rest}>{children}</Txt>;
}

export function Button({ label, onPress, kind = 'primary', disabled, loading, style }: {
  label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'tertiary' | 'outline' | 'danger'; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const k = kind === 'primary' ? 'primary' : kind === 'danger' ? 'refuse' : 'secondary';
  return <KitButton label={label} onPress={onPress} kind={k} disabled={disabled} busy={loading} block style={style} />;
}

export function Field({ label, ...input }: { label: string } & TextInputProps) {
  return <KitField label={label} {...input} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Panel style={style}>{children}</Panel>;
}

export function StatusPill({ kind, label }: { kind: 'ok' | 'wait' | 'no'; label: string }) {
  return <Tag tone={kind} label={label} />;
}
