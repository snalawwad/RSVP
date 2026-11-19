// Text in the five sizes (web .t-small/.t-body/.t-name/.t-title/.t-num) plus label/button/tab.
// The font follows the script of the words: Arabic letters → Noto Kufi Arabic (text) / Noto Naskh Arabic (titles),
// otherwise DM Sans (text) / Fraunces (titles). So a Latin name in the Arabic screen keeps its Latin font, like the web.
// Alignment follows the screen language; the writing direction follows the words (like <bdi>).
import type { ReactNode } from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { useApp } from '../providers/AppProvider';
import { textEnd, textStart } from '../theme/dir';
import { scriptOf, textStyle, type Colors, type Script, type TextVariant } from '../theme/tokens';

export type TextTone = 'ink' | 'muted' | 'plum' | 'ok' | 'wait' | 'no' | 'alert' | 'onPlum' | 'onAlert' | 'gold';
const toneColor = (c: Colors, t: TextTone) =>
  ({ ink: c.ink, muted: c.muted, plum: c.plum, ok: c.ok, wait: c.wait, no: c.no, alert: c.alert, onPlum: c.plumInk, onAlert: c.alertInk, gold: c.gold })[t];

/** The plain text inside children (strings and numbers only), to pick the script. */
export function plainText(children: ReactNode): string {
  if (children == null || typeof children === 'boolean') return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(plainText).join('');
  return '';
}

export type TxtProps = Omit<TextProps, 'style'> & {
  /** small 14 · body 16 · name 18 (semibold) · title 22 (display) · num 36 (display) · label 14 semibold · button 16 · buttonBig 18 · tab 15 */
  v?: TextVariant;
  /** colour by meaning; small defaults to muted, the rest to ink */
  tone?: TextTone;
  /** any colour (wins over tone) */
  color?: string;
  /** force Arabic or Latin fonts (default: from the words, else the screen language) */
  script?: Script;
  center?: boolean;
  /** put the text at the end of the line (numbers in a row's end) */
  end?: boolean;
  style?: StyleProp<TextStyle>;
  children?: ReactNode;
};

export function Txt({ v = 'body', tone, color, script, center, end, style, children, accessibilityRole, ...rest }: TxtProps) {
  const { c, rtl, lang } = useApp();
  const words = plainText(children);
  const sc: Script = script ?? (words ? scriptOf(words) : lang === 'ar' ? 'ar' : 'lat');
  const col = color ?? toneColor(c, tone ?? (v === 'small' ? 'muted' : 'ink'));
  const align = center ? 'center' : end ? textEnd(rtl) : textStart(rtl);
  return (
    <Text
      {...rest}
      accessibilityRole={accessibilityRole ?? (v === 'title' ? 'header' : undefined)}
      style={[textStyle(v, sc), { color: col, textAlign: align, writingDirection: words ? (sc === 'ar' ? 'rtl' : 'ltr') : rtl ? 'rtl' : 'ltr' }, style]}
    >
      {children}
    </Text>
  );
}
