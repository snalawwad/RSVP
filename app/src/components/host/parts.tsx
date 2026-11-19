// Small host-page pieces (host.css): the big number line, bold names inside a sentence, the 4-way filter,
// fold-out groups, the message "paper", and the "·"-separated meta line under a guest's name.
import { Fragment, useState, type ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { haptics } from '../../lib/haptics';
import { useApp } from '../../providers/AppProvider';
import { bodyFont, fonts, fs, mix, radius, scriptOf, size, space } from '../../theme/tokens';
import { Icon } from '../Icon';
import { PressScale } from '../Press';
import { Txt, type TxtProps } from '../Txt';
import type { HeroParts } from '../../i18n/host';
import { useHost } from './HostContext';

/** A name in bold inside running text (web: <bdi> in .next-p / .sr-names). Its own font for its own letters. */
export function B({ children }: { children: string }) {
  return <Text style={{ fontFamily: bodyFont(scriptOf(children), 'semi'), writingDirection: scriptOf(children) === 'ar' ? 'rtl' : 'ltr' }}>{`\u2068${children}\u2069`}</Text>;
}

const MARK = '\u0000';
/**
 * A sentence with names in bold: line = (nm) => t.host.nSendP(n, nm). The names go where the sentence puts them.
 * parts = { names, more } from useHost().nameParts.
 */
export function NamesLine({ line, parts, comma, ...txt }: TxtProps & { line: (nm: string) => string; parts: { names: string[]; more: string }; comma: string }) {
  const [before, after = ''] = line(MARK).split(MARK);
  return (
    <Txt {...txt}>
      {before}
      {parts.names.map((n, i) => <Fragment key={i}>{i ? comma : ''}<B>{n}</B></Fragment>)}
      {parts.more}{after}
    </Txt>
  );
}

/** The big number line (.bign): a 36px number or a 22px bold word, then the words. */
export function Hero({ parts, testID }: { parts: HeroParts; testID?: string }) {
  const { c } = useApp();
  return (
    <View testID={testID} accessible accessibilityRole="header" accessibilityLabel={[parts.n ?? parts.big, parts.w].filter((x) => x != null).join(' ')}
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10, rowGap: 4 }}>
      {parts.n != null ? <Txt v="num" color={c.ink}>{parts.n}</Txt> : null}
      {parts.big ? <Txt v="title" style={{ fontFamily: scriptOf(parts.big) === 'ar' ? fonts.arDisplayBold : fonts.display }}>{parts.big}</Txt> : null}
      <Txt v="name">{parts.w}</Txt>
    </View>
  );
}

/** The 4-way filter (.seg.fill.fseg): each option shows its count in bold over its name. 56 tall, shares the width. */
export function CountSeg<K extends string>({ options, value, onChange, label, testID, tall = true }: {
  options: { key: K; label: string; count?: number; a11y?: string }[]; value: K; onChange: (k: K) => void; label: string; testID?: string; tall?: boolean;
}) {
  const { c } = useApp();
  return (
    <View testID={testID} accessibilityRole="radiogroup" accessibilityLabel={label}
      style={{ flexDirection: 'row', gap: 2, padding: 3, borderWidth: 1, borderColor: c.line, borderRadius: radius.pill, backgroundColor: c.surface }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <PressScale key={o.key} kind="chip" testID={testID ? `${testID}-${o.key}` : undefined} accessibilityRole="radio" accessibilityState={{ selected: on, checked: on }} aria-checked={on}
            accessibilityLabel={o.a11y ?? o.label} onPress={() => { haptics.tap(); onChange(o.key); }} wrapStyle={{ flex: 1, minWidth: 0 }}
            style={{ minHeight: tall && o.count != null ? 56 : size.button, paddingHorizontal: 2, paddingVertical: 4, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
              backgroundColor: on ? c.card : 'transparent', borderWidth: 1.5, borderColor: on ? c.ink : 'transparent' }}>
            {o.count != null ? <Txt v="name" script="lat" center style={{ fontFamily: fonts.sansBold, lineHeight: 22, fontVariant: ['tabular-nums'] }}>{o.count}</Txt> : null}
            <Txt v="small" tone={on ? 'ink' : 'muted'} center numberOfLines={1} style={on ? { fontFamily: bodyFont(scriptOf(o.label), 'semi') } : undefined}>{o.label}</Txt>
          </PressScale>
        );
      })}
    </View>
  );
}

/** A fold-out section (.grp): a 64px heading row with a one-line preview; opens in place (no animation). */
export function Group({ title, preview, open, onToggle, children, testID }: {
  title: string; preview?: string; open: boolean; onToggle: () => void; children: ReactNode; testID?: string;
}) {
  const { c, rtl } = useApp();
  return (
    <View testID={testID} style={{ borderWidth: 1, borderColor: c.line, borderRadius: radius.l, backgroundColor: c.card, overflow: 'hidden' }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={title} onPress={onToggle} testID={testID ? `${testID}-head` : undefined}
        style={({ pressed }) => ({ minHeight: size.row, paddingHorizontal: space[4], paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: space[3],
          backgroundColor: pressed ? mix(c.card, c.ink, 0.08) : 'transparent' })}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="button">{title}</Txt>
          {!open && preview ? <Txt v="small" numberOfLines={1}>{preview}</Txt> : null}
        </View>
        <View style={{ transform: [{ rotate: open ? (rtl ? '-90deg' : '90deg') : '0deg' }] }}><Icon name="chev" color={c.muted} /></View>
      </Pressable>
      {open ? <View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: 18, gap: space[3] }}>{children}</View> : null}
    </View>
  );
}

/** The message as the guest reads it (.paper). */
export function Paper({ children, testID, style }: { children: string; testID?: string; style?: StyleProp<ViewStyle> }) {
  const { c } = useApp();
  return (
    <View testID={testID} style={[{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.m, paddingHorizontal: 14, paddingVertical: space[3] }, style]}>
      <Txt v="body" style={{ lineHeight: Math.round(fs.b * (scriptOf(children) === 'ar' ? 1.8 : 1.6)) }}>{children}</Txt>
    </View>
  );
}

/** "a · b · c" under a name: pieces may be tags (elements) or words. Wraps, never runs off the screen. */
export function Meta({ bits, testID }: { bits: ReactNode[]; testID?: string }) {
  const { c } = useApp();
  const list = bits.filter((b) => b !== null && b !== false && b !== '' && b !== undefined);
  return (
    <View testID={testID} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 2, marginTop: 3 }}>
      {list.map((b, i) => (
        <Fragment key={i}>
          {i ? <Txt v="small" color={c.muted} style={{ opacity: 0.6 }}>·</Txt> : null}
          {typeof b === 'string' || typeof b === 'number' ? <Txt v="small">{b}</Txt> : b}
        </Fragment>
      ))}
    </View>
  );
}

/** Heading inside a panel (.next-h): body font, 18 semibold. */
export function PanelHead({ children }: { children: string }) {
  return <Txt v="name" accessibilityRole="header">{children}</Txt>;
}

/** Pull to refresh: guests and the door's requests again. */
export function usePull() {
  const h = useHost();
  const [refreshing, setR] = useState(false);
  return { refreshing, onRefresh: async () => { setR(true); await Promise.all([h.reload(), h.loadReqs()]); setR(false); } };
}

/** Remember an open/closed fold for the screen's life. */
export function useFolds<K extends string>() {
  const [open, setOpen] = useState<Partial<Record<K, boolean>>>({});
  return { isOpen: (k: K) => !!open[k], toggle: (k: K) => setOpen((o) => ({ ...o, [k]: !o[k] })), set: (k: K, v: boolean) => setOpen((o) => ({ ...o, [k]: v })) };
}
