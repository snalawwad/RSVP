// Door screen pieces, drawn like door.html + door.css on top of the shared kit.
import { forwardRef, useState, type ComponentRef, type ReactNode } from 'react';
import { router } from 'expo-router';
import { Platform, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { DoorGuest, DoorRequest } from '../../lib/api';
import { haptics } from '../../lib/haptics';
import { showPhone } from '../../lib/phone';
import { countWord } from '../../lib/words';
import { useApp } from '../../providers/AppProvider';
import { textStart } from '../../theme/dir';
import { alpha, bodyFont, fs, mix, radius, scriptOf, shadow, size, space, toneColors, type TextVariant } from '../../theme/tokens';
import { Button } from '../Button';
import { Icon, type IconName } from '../Icon';
import { Panel } from '../Panel';
import { PressScale } from '../Press';
import { Stepper } from '../Stepper';
import { Tag } from '../Tag';
import { Txt } from '../Txt';
import { phoneRanges, pieces, type Range } from './logic';

type DoorT = ReturnType<typeof useApp>['t']['door'];

/** Text with the typed letters marked (web <mark>: a gold wash with a gold underline). */
export function Marked({ text, ranges, v = 'name', color, style, numberOfLines, testID }: {
  text: string; ranges?: Range[]; v?: TextVariant; color?: string; style?: object; numberOfLines?: number; testID?: string;
}) {
  const { c } = useApp();
  const parts = pieces(text, ranges);
  return (
    <Txt v={v} script={scriptOf(text)} color={color} style={style} numberOfLines={numberOfLines} testID={testID}>
      {parts.map((p, i) => p.mark
        ? <Text key={i} style={{ backgroundColor: alpha(c.gold, 0.26), textDecorationLine: 'underline', textDecorationColor: c.gold }}>{p.t}</Text>
        : <Text key={i}>{p.t}</Text>)}
    </Txt>
  );
}

/** "Live" with a green dot, "Offline, retrying" with a red one (web .live). */
export function LivePill({ on, label }: { on: boolean; label: string }) {
  const { c } = useApp();
  return (
    <View testID="door-live" accessibilityRole="text" accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: on ? c.okMark : c.noMark }} />
      <Txt v="label" tone="muted">{label}</Txt>
    </View>
  );
}

/** The meter: big green number + "of 18 people in", who hasn't replied, requests waiting, and the bar. */
export function DoorMeter({ arrived, label, a11y, hideNum, sub, waitLabel, onWait, pct, typing }: {
  arrived: number; label: string; a11y: string; hideNum: boolean; sub: string; waitLabel: string | null; onWait: () => void; pct: number; typing: boolean;
}) {
  const { c } = useApp();
  return (
    <View testID="door-meter">
      {!typing ? (
        <View accessible accessibilityLabel={a11y} style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[2], minHeight: size.target, flexWrap: 'wrap' }}>
          {!hideNum ? <Txt v="num" script="lat" color={c.ok} testID="door-meter-n">{arrived}</Txt> : null}
          <Txt v="body" style={{ fontFamily: bodyFont(scriptOf(label), 'semi') }}>{label}</Txt>
        </View>
      ) : null}
      {!typing && (sub || waitLabel) ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          <View style={{ flexShrink: 1, minWidth: 0 }}>{sub ? <Txt v="small" testID="door-meter-sub">{sub}</Txt> : null}</View>
          {waitLabel ? (
            <PressScale kind="chip" testID="door-wait-chip" accessibilityRole="button" accessibilityLabel={waitLabel} onPress={onWait} wrapStyle={{ marginStart: 'auto' }}
              style={({ pressed }) => ({ minHeight: size.target, flexDirection: 'row', alignItems: 'center', gap: 4, paddingStart: 14, paddingEnd: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: c.waitMark, backgroundColor: pressed ? mix(c.waitBg, c.wait, 0.1) : c.waitBg })}>
              <Txt v="label" color={c.wait}>{waitLabel}</Txt>
              <Icon name="chev" sm color={c.wait} />
            </PressScale>
          ) : null}
        </View>
      ) : null}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={{ height: 6, borderRadius: radius.pill, backgroundColor: mix(c.surface, c.line, 0.7), marginTop: typing ? 0 : space[2], overflow: 'hidden' }}>
        <View testID="door-meter-bar" style={{ height: '100%', width: `${pct}%`, borderRadius: radius.pill, backgroundColor: c.okMark }} />
      </View>
    </View>
  );
}

/** The big search box (56 tall, 18px) with its clear button, and the 123 / abc key next to it. */
export const SearchRow = forwardRef<ComponentRef<typeof TextInput>, {
  value: string; onChange: (s: string) => void; onClear: () => void; numMode: boolean; onKb: () => void; t: DoorT; onSubmit: () => void;
}>(function SearchRow({ value, onChange, onClear, numMode, onKb, t, onSubmit }, ref) {
  const { c, rtl, lang } = useApp();
  const sc = value ? scriptOf(value) : lang === 'ar' ? 'ar' : 'lat';
  return (
    <View style={{ flexDirection: 'row', gap: space[2], marginTop: 10, alignItems: 'stretch' }}>
      <View style={{ flex: 1, minWidth: 0, minHeight: size.buttonBig, flexDirection: 'row', alignItems: 'center', borderRadius: radius.m, borderWidth: 1, borderColor: c.fieldLine, backgroundColor: c.card }}>
        <View style={{ paddingStart: 16, paddingEnd: 2 }} pointerEvents="none"><Icon name="search" size={22} color={c.muted} /></View>
        <TextInput
          ref={ref}
          testID="door-search"
          value={value}
          onChangeText={onChange}
          placeholder={t.searchPh}
          placeholderTextColor={c.muted}
          accessibilityLabel={t.search}
          selectionColor={c.plum}
          inputMode={numMode ? 'tel' : 'text'}
          autoCapitalize={numMode ? 'none' : 'words'}
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          returnKeyType="search"
          enterKeyHint="search"
          onSubmitEditing={onSubmit}
          onKeyPress={(e) => { if (e.nativeEvent.key === 'Escape') onClear(); }}
          style={{
            flex: 1, minWidth: 0, width: 0, minHeight: size.buttonBig, color: c.ink, fontFamily: bodyFont(sc), fontSize: fs.name, paddingHorizontal: 10, paddingVertical: 8,
            textAlign: value ? textStart(sc === 'ar') : textStart(rtl), writingDirection: value ? (sc === 'ar' ? 'rtl' : 'ltr') : rtl ? 'rtl' : 'ltr', outlineStyle: 'none',
          } as object}
        />
        {value ? (
          <PressScale kind="chip" testID="door-clear" accessibilityRole="button" accessibilityLabel={t.clear} onPress={onClear} wrapStyle={{ marginEnd: 6 }}
            style={({ pressed }) => ({ width: size.target, height: size.target, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? alpha(c.ink, 0.07) : 'transparent' })}>
            <Icon name="x" color={c.muted} />
          </PressScale>
        ) : null}
      </View>
      <PressScale kind="chip" testID="door-kb" accessibilityRole="button" accessibilityLabel={numMode ? t.kbAbc : t.kbNum} accessibilityState={{ selected: numMode }} onPress={onKb}
        style={{ width: 60, minHeight: size.buttonBig, flex: 1, borderRadius: radius.m, borderWidth: numMode ? 2.5 : 1, borderColor: numMode ? c.ink : c.fieldLine, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
        <Txt v="button" center script={numMode && lang === 'ar' ? 'ar' : 'lat'}>{numMode ? t.kbAbcL : '123'}</Txt>
      </PressScale>
    </View>
  );
});

/** The stepper always reads − n + left to right (web dir="ltr"). */
function LtrStepper(p: Parameters<typeof Stepper>[0]) {
  return <View style={{ direction: 'ltr' }}><Stepper {...p} /></View>;
}

/** The door's stepper (door.css .door-act .stepper): 56 tall, 46px round buttons, − n + always left to right. */
export function DoorStepper({ value, max, onChange, label, lessLabel, moreLabel, testID }: {
  value: number; max: number; onChange: (d: 1 | -1) => void; label: string; lessLabel: string; moreLabel: string; testID?: string;
}) {
  const { c } = useApp();
  const btn = (d: -1 | 1) => {
    const off = d < 0 ? value <= 1 : value >= max;
    return (
      <PressScale kind="chip" accessibilityRole="button" accessibilityLabel={d < 0 ? lessLabel : moreLabel} accessibilityState={{ disabled: off }} aria-disabled={off} disabled={off}
        onPress={() => { haptics.tap(); onChange(d); }}
        style={({ pressed }) => ({ width: 46, height: 46, borderRadius: radius.pill, backgroundColor: pressed ? c.accentSoft : c.surface, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.35 : 1 })}>
        <Txt v="title" script="lat" center style={{ fontFamily: bodyFont('lat', 'medium'), fontSize: fs.h, lineHeight: fs.h + 4 }}>{d < 0 ? '−' : '+'}</Txt>
      </PressScale>
    );
  };
  return (
    <View testID={testID} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min: 1, max, now: value }}
      style={{ direction: 'ltr', flexDirection: 'row', alignItems: 'center', gap: 2, height: size.buttonBig, borderWidth: 1, borderColor: c.fieldLine, borderRadius: radius.pill, paddingHorizontal: 4, backgroundColor: c.card }}>
      {btn(-1)}
      <Txt v="name" script="lat" center accessibilityLiveRegion="polite" testID={testID ? `${testID}-n` : undefined} style={{ minWidth: 34, fontSize: fs.h, lineHeight: fs.h + 6, fontVariant: ['tabular-nums'] }}>{value}</Txt>
      {btn(1)}
    </View>
  );
}

/** The door's big Check-in button (door.css .door-act .btn): 56 tall, 18px, 14px sides, wraps to two lines. */
export function CheckInButton({ label, kind, busy, disabled, onPress, testID }: { label: string; kind: 'primary' | 'secondary' | 'retry'; busy?: boolean; disabled?: boolean; onPress: () => void; testID?: string }) {
  const { c } = useApp();
  const look = kind === 'primary' ? { bg: c.plum, bd: c.plum, fg: c.plumInk } : kind === 'retry' ? { bg: c.noBg, bd: c.noMark, fg: c.no } : { bg: c.card, bd: c.fieldLine, fg: c.ink };
  return (
    <PressScale testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, busy: !!busy }} aria-busy={!!busy} disabled={disabled || busy}
      onPress={onPress} wrapStyle={{ flex: 1, alignSelf: 'stretch' }}
      style={{ minHeight: size.buttonBig, borderRadius: 28, borderWidth: 1, borderColor: look.bd, backgroundColor: look.bg, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.55 : 1 }}>
      <Txt v="buttonBig" color={look.fg} center style={{ lineHeight: Math.round(fs.name * (scriptOf(label) === 'ar' ? 1.45 : 1.3)) }}>{label}</Txt>
    </PressScale>
  );
}

/** A short coloured line under a guest about the last request to the hosts (web .d-req). */
function ReqLine({ req, t }: { req: DoorRequest; t: DoorT }) {
  const { c } = useApp();
  const tone = req.status === 'approved' ? 'ok' : req.status === 'rejected' ? 'no' : 'wait';
  return <Txt v="label" color={toneColors(c, tone).fg}>{t.reqLine[req.status](req.people)}</Txt>;
}

export type CardProps = {
  g: DoorGuest; v2: boolean; t: DoorT; state: 'open' | 'part' | 'wait' | 'no' | 'all';
  ranges?: Range[]; phoneDigits?: string;
  n: number; left: number; allowedN: number; time: string;
  primary: boolean; busy: boolean; listBusy: boolean; failed: boolean;
  req?: DoorRequest; extraAsk?: number;
  onStep: (d: 1 | -1) => void; onCheckIn: () => void; onAskX: () => void; onAsk: () => void;
};

/** One guest in the results (web .drow). Already in: an amber card with the time, never a check-in button. */
export function GuestCard(p: CardProps) {
  const { c, theme, lang } = useApp();
  const { width } = useWindowDimensions();
  const { g, t, v2 } = p;
  const done = g.checked_in_count || 0;
  const phoneShown = g.phone ? showPhone(g.phone) : '';
  const top = (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}><Marked text={g.name} ranges={p.ranges} testID={`name-${g.id}`} /></View>
      {phoneShown ? <View style={{ direction: 'ltr', flexShrink: 0 }}><Marked v="small" text={phoneShown} ranges={phoneRanges(phoneShown, p.phoneDigits)} color={c.muted} style={{ fontFamily: bodyFont('lat', 'medium'), fontVariant: ['tabular-nums'] }} /></View> : null}
    </View>
  );
  const side = g.side ? <Txt v="small">{g.side}</Txt> : null;
  const rq = v2 && p.req ? <ReqLine req={p.req} t={t} /> : null;

  if (p.state === 'all') {
    const n = v2 ? done : g.seats;
    const already = v2 ? t.already(n, p.time) : t.alreadyOld + (p.time ? ' · ' + p.time : '');
    return (
      <Panel tone="wait" padding={0} gap={6} testID={`card-${g.id}`} style={{ paddingTop: 14, paddingBottom: 16, paddingHorizontal: 16 }}>
        {top}
        <Txt v="name" color={c.wait} style={{ fontFamily: bodyFont(scriptOf(already), 'bold') }} testID={`already-${g.id}`}>{already}</Txt>
        {v2 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 }}>
            <Txt v="small" tone="ink">{t.invited(g.seats, g.confirmed_count, g.status)}</Txt>
            {g.side ? <Txt v="small" tone="ink">{'· ' + g.side}</Txt> : null}
          </View>
        ) : null}
        {rq}
        {v2 ? (
          <View style={{ marginTop: 6 }}>
            <Button big block label={t.askAbout(p.extraAsk || 1)} onPress={p.onAsk} disabled={p.listBusy} testID={`ask-${g.id}`} />
          </View>
        ) : null}
      </Panel>
    );
  }

  const P = (n: number) => countWord(n, 'person', lang);
  let tag: 'ok' | 'wait' | 'no', line = '';
  if (!v2) { tag = g.status === 'no' ? 'no' : g.status === 'pending' ? 'wait' : 'ok'; line = P(g.seats); }
  else if (p.state === 'no') tag = 'no';
  else { tag = p.state === 'wait' ? 'wait' : 'ok'; line = done ? t.inLeft(done, p.left) : p.state === 'wait' ? t.upTo(p.left) : P(p.left); }
  const tagTxt = { ok: t.coming, wait: t.noReply, no: t.declined }[tag];

  const label = p.n > p.left ? t.checkInNow(p.left) : t.checkInN(p.n, p.left);
  const ci = (lbl: string) => (
    <CheckInButton label={p.busy ? t.busy : p.failed ? t.retry : lbl} kind={p.failed ? 'retry' : p.primary ? 'primary' : 'secondary'}
      busy={p.busy} disabled={p.listBusy && !p.busy} onPress={p.onCheckIn} testID={`ci-${g.id}`} />
  );
  const narrow = width < 375;
  let act: ReactNode;
  if (!v2) act = <View style={{ marginTop: 6 }}>{ci(t.checkInN(g.seats, g.seats))}</View>;
  else if (p.state === 'no') act = <View style={{ marginTop: 6 }}><Button big block label={t.askHost} onPress={p.onAsk} disabled={p.listBusy} testID={`ask-${g.id}`} /></View>;
  else {
    act = (
      <>
        <View style={{ flexDirection: narrow ? 'column' : 'row', alignItems: narrow ? 'stretch' : 'center', gap: 10, marginTop: 6, opacity: p.listBusy && !p.busy ? 0.55 : 1 }}>
          <View style={{ alignSelf: narrow ? 'flex-start' : 'auto' }}>
            <DoorStepper value={p.n} max={p.left + 6} onChange={p.onStep} label={t.howMany} lessLabel={t.less} moreLabel={t.more} testID={`step-${g.id}`} />
          </View>
          {ci(label)}
        </View>
        {p.n > p.left ? <Button big block label={t.askAbout(p.n - p.left)} onPress={p.onAskX} disabled={p.listBusy} testID={`askx-${g.id}`} /> : null}
      </>
    );
  }
  return (
    <View testID={`card-${g.id}`} style={[{ backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: radius.l, paddingTop: 14, paddingBottom: 16, paddingHorizontal: 16, gap: 6 }, shadow(theme)]}>
      {top}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 4 }}>
        <Tag label={tagTxt} tone={tag} />
        {line ? <Txt v="body" style={{ fontFamily: bodyFont(scriptOf(line), 'semi') }} testID={`count-${g.id}`}>{line}</Txt> : null}
        {side}
      </View>
      {g.status === 'no' && g.decline_reason ? (
        <View style={{ backgroundColor: c.noBg, borderStartWidth: 3, borderStartColor: c.noMark, borderRadius: radius.s, paddingVertical: 6, paddingHorizontal: 10 }}>
          <Sentence v="small" tpl={(x) => `${t.reason}: “${x}”`} name={g.decline_reason} color={c.ink} testID={`why-${g.id}`} />
        </View>
      ) : null}
      {rq}
      {act}
    </View>
  );
}
/** A notice that waits for Close (over the limit, already in, not found) — web .dnotice */
export type NoticeBtn = { label: string; kind: 'primary' | 'secondary' | 'quiet'; onPress: () => void; testID?: string };
export function Notice({ tone, title, name, sub, buttons }: { tone: 'ok' | 'wait' | 'no'; title: string; name: string; sub?: string; buttons: NoticeBtn[] }) {
  const { c } = useApp();
  return (
    <Panel tone={tone} testID="door-notice" gap={2}>
      <Txt v="body" color={toneColors(c, tone).fg} style={{ fontFamily: bodyFont(scriptOf(title), 'bold') }}>{title}</Txt>
      {name ? <Txt v="name">{name}</Txt> : null}
      {sub ? <Txt v="body" style={{ marginTop: 2 }}>{sub}</Txt> : null}
      {buttons.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: 12 }}>
          {buttons.map((b, i) => (
            <View key={i} style={b.kind === 'quiet' ? undefined : { flexGrow: 1 }}>
              <Button block label={b.label} kind={b.kind} onPress={b.onPress} testID={b.testID} />
            </View>
          ))}
        </View>
      ) : null}
    </Panel>
  );
}

/** An answer from the hosts (web .answer): green yes / red no, with a hide button. compact: one line (typing). */
export function AnswerCard({ ok, title, sub, onHide, hideLabel, compact, testID }: { ok: boolean; title: ReactNode; sub: string; onHide: () => void; hideLabel: string; compact?: boolean; testID?: string }) {
  const { c } = useApp();
  const tc = toneColors(c, ok ? 'ok' : 'no');
  return (
    <Panel tone={ok ? 'ok' : 'no'} padding={0} testID={testID}
      style={{ flexDirection: 'row', alignItems: compact ? 'center' : 'flex-start', gap: 10, paddingVertical: compact ? 0 : 10, paddingStart: 14, paddingEnd: 4 }}>
      <View style={{ marginTop: compact ? 0 : 3 }}><Icon name={ok ? 'check' : 'x'} color={tc.fg} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {title}
        {!compact ? <Txt v="small" tone="ink" style={{ marginTop: 2 }}>{sub}</Txt> : null}
      </View>
      <PressScale kind="chip" accessibilityRole="button" accessibilityLabel={hideLabel} onPress={onHide} testID={testID ? `${testID}-x` : undefined}
        style={({ pressed }) => ({ width: size.target, height: size.target, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: compact ? 0 : -6, backgroundColor: pressed ? alpha(c.ink, 0.07) : 'transparent' })}>
        <Icon name="x" color={c.ink} />
      </PressScale>
    </Panel>
  );
}

/** A status tag with three quiet dots while waiting (web .tag + .dots). */
export function ReqTag({ label, tone, waiting }: { label: string; tone: 'ok' | 'wait' | 'no'; waiting?: boolean }) {
  const { c } = useApp();
  if (!waiting) return <Tag label={label} tone={tone} />;
  const tc = toneColors(c, tone);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.s, paddingHorizontal: 9, paddingVertical: 1, backgroundColor: tc.bg }}>
      <Txt v="label" color={tc.fg}>{label}</Txt>
      <View style={{ flexDirection: 'row', gap: 3 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[0, 1, 2].map((i) => <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: tc.fg }} />)}
      </View>
    </View>
  );
}

/** A small eyebrow above a group (web h2.eyebrow.d-cap). */
export function Cap({ children, first }: { children: string; first?: boolean }) {
  return <View style={{ marginTop: first ? 4 : 22, marginBottom: 10, paddingHorizontal: 4 }}><Txt v="label" tone="muted" accessibilityRole="header">{children}</Txt></View>;
}

/** A quiet centred link-button with an icon (web .btn.quiet in .dmore / .dlinks). */
export function QuietLink({ icon, label, onPress, testID, ink }: { icon: IconName; label: string; onPress: () => void; testID?: string; ink?: boolean }) {
  const { c } = useApp();
  return (
    <PressScale testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => ({ minHeight: size.target, flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[4], borderRadius: radius.pill, backgroundColor: pressed ? alpha(ink ? c.ink : c.plum, 0.08) : 'transparent' })}>
      <Icon name={icon} sm color={ink ? c.ink : c.plum} />
      <Txt v="button" color={ink ? c.ink : c.plum}>{label}</Txt>
    </PressScale>
  );
}

/** Round number chips 1–6 and 7+ in the ask sheet (web .pchips). Seven 44px chips need 344px; on narrower
 *  phones (iPhone SE/mini, most Androids at 360) 1–6 stay on one line and 7+ goes on its own line under them,
 *  so nothing is cut off and every chip keeps a 44px target (the chips are sized to fill a whole line of 6,
 *  so 7+ wraps by itself). Hidden for the one frame before the row is measured. */
const CHIP_MIN = size.target, CHIP_MAX = 56, CHIP_GAP = 6, CHIP_GAP_TIGHT = 4;
export function chipLayout(w: number) {
  if (!w) return null;
  const one = (w - 6 * CHIP_GAP) / 7;
  if (one >= CHIP_MIN) return { wrap: false, gap: CHIP_GAP, d: Math.min(CHIP_MAX, Math.floor(one)) };
  const gap = (w - 5 * CHIP_GAP) / 6 >= CHIP_MIN ? CHIP_GAP : CHIP_GAP_TIGHT;
  return { wrap: true, gap, d: Math.max(CHIP_MIN, Math.min(CHIP_MAX, Math.floor((w - 5 * gap) / 6))) };
}
export function PeopleChips({ value, onPick, onBig, bigLabel, label }: { value: number; onPick: (n: number) => void; onBig: () => void; bigLabel: string; label: string }) {
  const { c } = useApp();
  const [w, setW] = useState(0);
  const L = chipLayout(w);
  const chip = (key: string, text: string, on: boolean, onPress: () => void, a11y?: string) => (
    <PressScale key={key} kind="chip" testID={`pchip-${key}`} accessibilityRole="radio" accessibilityLabel={a11y ?? text} accessibilityState={{ checked: on, selected: on }} aria-checked={on} onPress={onPress}
      wrapStyle={L ? { width: L.d } : { flex: 1, maxWidth: CHIP_MAX }}
      style={{ aspectRatio: 1, minHeight: size.target, borderRadius: radius.pill, borderWidth: on ? 2.5 : 1, borderColor: on ? c.ink : c.fieldLine, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
      <Txt v={key === 'big' ? 'button' : 'name'} script="lat" center>{text}</Txt>
    </PressScale>
  );
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} testID="pchips" onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))}
      style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: L?.gap ?? CHIP_GAP, rowGap: 8, minWidth: 0, alignSelf: 'stretch', opacity: L ? 1 : 0 }}>
      {[1, 2, 3, 4, 5, 6].map((n) => chip(String(n), String(n), value === n, () => onPick(n)))}
      {chip('big', '7+', value > 6, onBig, bigLabel)}
    </View>
  );
}

export { LtrStepper };

/** Web only: the stack's own back arrow is a 30px target there, so the door gets the same round 44px back
 *  button as Menu / Help / Delete account (app/(app)/_layout.tsx). Native keeps the system back button. */
function DoorBackButton() {
  const { t, c, rtl } = useApp();
  return (
    <View style={{ marginHorizontal: space[4] }}>
      <PressScale kind="chip" testID="header-back" accessibilityRole="button" accessibilityLabel={t.back} hitSlop={4}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={{ width: size.target, height: size.target, borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="chev" color={c.plum} flip={!rtl} />
      </PressScale>
    </View>
  );
}
export const doorWebBack = Platform.OS === 'web' ? { headerLeft: () => <DoorBackButton /> } : {};

/** A row in "Just arrived": tap the name to find them again; Undo for 10 minutes after this phone checked them in. */
export function RecentRow({ name, sub, time, undoLabel, onFind, onUndo, testID }: { name: string; sub: string; time: string; undoLabel?: string; onFind: () => void; onUndo?: () => void; testID?: string }) {
  const { c } = useApp();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }} testID={testID}>
      <Pressable accessibilityRole="button" onPress={onFind} testID={testID ? `${testID}-find` : undefined}
        style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: size.row, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: pressed ? mix(c.card, c.ink, 0.08) : 'transparent' })}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="name" numberOfLines={1}>{name}</Txt>
          <Txt v="small">{sub}</Txt>
        </View>
        <Txt v="small" end style={{ fontVariant: ['tabular-nums'] }}>{time}</Txt>
      </Pressable>
      {onUndo && undoLabel ? (
        <View style={{ marginEnd: 12 }}>
          <Button small label={undoLabel} accessibilityLabel={`${undoLabel}: ${name}`} onPress={onUndo} testID={testID ? `${testID}-undo` : undefined} />
        </View>
      ) : null}
    </View>
  );
}

const SLOT = '';
/**
 * A sentence in the screen's language with a name inside it (web: <bdi>name</bdi>). The sentence keeps the
 * screen's direction and font; the name is isolated (FSI…PDI) and drawn in its own script's font.
 * tpl gets a placeholder and returns the sentence, e.g. (x) => t.door.band(x, 2).
 */
export function Sentence({ tpl, name, v = 'body', weight = 'regular', color, numberOfLines, testID, center }: {
  tpl: (slot: string) => string; name: string; v?: TextVariant; weight?: 'regular' | 'medium' | 'semi' | 'bold'; color?: string; numberOfLines?: number; testID?: string; center?: boolean;
}) {
  const { lang } = useApp();
  const sc = lang === 'ar' ? 'ar' : 'lat';
  const [a, b = ''] = tpl(SLOT).split(SLOT);
  const fam = (s: 'ar' | 'lat') => (weight === 'regular' && v !== 'name' ? bodyFont(s) : bodyFont(s, v === 'name' && weight === 'regular' ? 'semi' : weight));
  return (
    <Txt v={v} script={sc} color={color} numberOfLines={numberOfLines} testID={testID} center={center} style={{ fontFamily: fam(sc) }}>
      {a}<Text style={{ fontFamily: fam(scriptOf(name)) }}>{'⁨' + name + '⁩'}</Text>{b}
    </Txt>
  );
}

/** The door's band (web .undoband in #undoSlot): strong green/amber/red, the sentence, a sub line, Undo. */
export function DoorBand({ title, sub, hint, undoLabel, onUndo, tone, compact, testID = 'door-band' }: {
  title: ReactNode; sub?: string; hint?: string; undoLabel?: string; onUndo?: () => void; tone: 'ok' | 'wait' | 'no'; compact?: boolean; testID?: string;
}) {
  const { c } = useApp();
  const tc = toneColors(c, tone);
  return (
    <View testID={testID} accessibilityRole="alert" accessibilityLiveRegion="polite"
      style={{ minHeight: compact ? 48 : size.undoBand, borderRadius: radius.m, backgroundColor: tc.strong, paddingVertical: compact ? 2 : 10, paddingStart: space[4], paddingEnd: space[3], flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        {title}
        {!compact && sub ? <Txt v="small" color={tc.strongInk} style={{ fontFamily: bodyFont(scriptOf(sub), 'medium') }}>{sub}</Txt> : null}
        {!compact && hint ? <Txt v="small" color={tc.strongInk} style={{ fontFamily: bodyFont(scriptOf(hint), 'semi') }} testID={`${testID}-hint`}>{hint}</Txt> : null}
      </View>
      {onUndo && undoLabel ? (
        <PressScale kind="chip" accessibilityRole="button" accessibilityLabel={undoLabel} onPress={onUndo} testID={`${testID}-undo`}
          style={({ pressed }) => ({ minWidth: 76, minHeight: compact ? size.target : size.button, paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: 1.5, borderColor: tc.strongInk, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? 'rgba(127,127,127,0.18)' : 'transparent' })}>
          <Txt v="button" color={tc.strongInk} style={{ fontFamily: bodyFont(scriptOf(undoLabel), 'bold') }}>{undoLabel}</Txt>
        </PressScale>
      ) : null}
    </View>
  );
}
