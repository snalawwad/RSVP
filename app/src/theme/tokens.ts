// Design tokens: the web back office (style.css, body.app section, Nov 2026) ported to React Native.
// The web is the source of truth. Same names as the CSS custom properties, in camelCase:
//   --bg → bg, --field-line → fieldLine, --plum-ink → plumInk, --ok-bg → okBg …
// Modes: cream (default), light, dark. "auto" follows the phone (dark, or cream when the phone is light).

export type ThemeName = 'cream' | 'light' | 'dark';
export type ThemePref = ThemeName | 'auto';
export type Tone = 'ok' | 'wait' | 'no' | 'mute';

export type Colors = {
  bg: string; surface: string; card: string;
  ink: string; muted: string; line: string; fieldLine: string;
  plum: string; plumInk: string; gold: string; focus: string; accentSoft: string;
  ok: string; okBg: string; okBar: string; okMark: string; okStrong: string; okStrongInk: string;
  wait: string; waitBg: string; waitBar: string; waitMark: string; waitStrong: string; waitStrongInk: string;
  no: string; noBg: string; noBar: string; noMark: string; noStrong: string; noStrongInk: string;
  alert: string; alertInk: string;
  /** sheet backdrop, rgba(20,21,20,.45) like dialog.sheet::backdrop */
  scrim: string;
  /** shadow colour for cards (iOS shadow / web box-shadow) */
  shadow: string;

  // ---- legacy aliases for the partner's first screens (src/components/ui.tsx). Do not use in new code. ----
  surfaceRaised: string; inkMuted: string; lineControl: string; primary: string; onPrimary: string;
  okSoft: string; waitSoft: string; noSoft: string;
};

// brand palette (web: --ox --sage --blush --powder --ivory)
export const palette = { ox: '#5B0F1D', sage: '#9BA38F', blush: '#E7B6B6', powder: '#C7D5E4', ivory: '#EDE5DA' } as const;

const cream = {
  bg: '#EDE5DA', surface: '#E4DACB', card: '#F8F3EC',
  ink: '#26181A', muted: '#625350', line: '#D9CCBB', fieldLine: '#80705F',
  plum: '#5B0F1D', plumInk: '#FBF4EC', gold: '#75583F', focus: '#5B0F1D', accentSoft: '#F1DEDB',
  ok: '#2C5E3B', okBg: '#DCEADF', okBar: '#8DB59A', okMark: '#3E8152', okStrong: '#1F6B3A', okStrongInk: '#FFFFFF',
  wait: '#74490C', waitBg: '#F6E5C3', waitBar: '#E0B45C', waitMark: '#A26E17', waitStrong: '#F2CF85', waitStrongInk: '#3A2606',
  no: '#8A1D28', noBg: '#F6DADA', noBar: '#E2A3A6', noMark: '#B3383F', noStrong: '#B3261E', noStrongInk: '#FFFFFF',
  alert: '#B3261E', alertInk: '#FFFFFF',
  scrim: 'rgba(20,21,20,0.45)', shadow: '#3C1E14',
};
const light = { ...cream, bg: '#FFFFFF', surface: '#F6F1EA', card: '#FFFFFF', line: '#E7DED2', muted: '#625350', accentSoft: '#F7E7E5', shadow: '#281414' };
const dark = {
  ...cream,
  bg: '#141514', surface: '#1A1B19', card: '#1E1F1C', ink: '#EDE5DA', muted: '#AAA296', line: '#2E2F2A', fieldLine: '#74756B',
  plum: '#E7B6B6', plumInk: '#2A0910', gold: '#C9B59C', focus: '#C7D5E4', accentSoft: '#3A2226',
  ok: '#A9D9B6', okBg: '#1B2E21', okBar: '#4F8A60', okMark: '#6FB283', okStrong: '#1F6B3A', okStrongInk: '#FFFFFF',
  wait: '#EDC77E', waitBg: '#2F2514', waitBar: '#A9843A', waitMark: '#C99A45', waitStrong: '#E2B65C', waitStrongInk: '#2A1B04',
  no: '#F2AEB2', noBg: '#3A1C21', noBar: '#B9575F', noMark: '#D2646C', noStrong: '#C2362D', noStrongInk: '#FFFFFF',
  alert: '#C2362D', alertInk: '#FFFFFF',
  scrim: 'rgba(0,0,0,0.55)', shadow: '#000000',
};

const withLegacy = (x: typeof cream): Colors => ({
  ...x,
  surfaceRaised: x.card, inkMuted: x.muted, lineControl: x.fieldLine, primary: x.plum, onPrimary: x.plumInk,
  okSoft: x.okBg, waitSoft: x.waitBg, noSoft: x.noBg,
});

export const colors: Record<ThemeName, Colors> = { cream: withLegacy(cream), light: withLegacy(light), dark: withLegacy(dark) };

/** Swatches for the Colours switch (web .sw-cream/.sw-light/.sw-dark). */
export const swatch: Record<ThemeName, string> = { cream: '#EDE5DA', light: '#FFFFFF', dark: '#141514' };

/** The tone set for a status (web .tone-ok / .tone-wait / .tone-no / .tone-mute). */
export function toneColors(c: Colors, tone: Tone) {
  switch (tone) {
    case 'ok': return { fg: c.ok, bg: c.okBg, bar: c.okBar, mark: c.okMark, strong: c.okStrong, strongInk: c.okStrongInk };
    case 'wait': return { fg: c.wait, bg: c.waitBg, bar: c.waitBar, mark: c.waitMark, strong: c.waitStrong, strongInk: c.waitStrongInk };
    case 'no': return { fg: c.no, bg: c.noBg, bar: c.noBar, mark: c.noMark, strong: c.noStrong, strongInk: c.noStrongInk };
    default: return { fg: c.muted, bg: c.surface, bar: c.line, mark: c.muted, strong: c.muted, strongInk: c.card };
  }
}
/** guest status → tone (yes = green, pending = amber, no = red) */
export const statusTone = (s: 'yes' | 'pending' | 'no' | string): Tone => (s === 'yes' ? 'ok' : s === 'no' ? 'no' : s === 'pending' ? 'wait' : 'mute');

// ---------- type: five sizes only (+ 15 for tab labels) ----------
export const fs = { s: 14, tab: 15, b: 16, name: 18, h: 22, num: 36 } as const;

// ---------- one radius scale ----------
// s: tags, notes · m: fields, alert/undo bars, toast · l: cards, panels, sheets · pill: buttons, chips, segments
export const radius = { s: 8, m: 12, l: 18, pill: 999 } as const;

// ---------- spacing (4px grid). The page gutter is 16. ----------
export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 10: 40, 12: 48 } as const;
export const gutter = 16;

// ---------- sizes ----------
/** every control outside running text is at least this tall */
export const target = 44;
export const size = { target: 44, button: 48, buttonBig: 56, row: 64, alertBar: 56, undoBand: 60, tabBar: 56, stepper: 48 } as const;

// ---------- motion: hover in / out, press, panel; one ease-out curve ----------
export const motion = { in: 150, out: 120, press: 90, panel: 200, pressScale: 0.985, pressY: 1, chipScale: 0.97 } as const;

// ---------- fonts ----------
// Loaded in src/app/_layout.tsx with useFonts. Each weight is its own family (no synthetic bold).
export const fonts = {
  // Latin
  display: 'Fraunces_600SemiBold',          // Latin headings, the big number
  sans: 'DMSans_400Regular',
  sansMedium: 'DMSans_500Medium',
  sansSemi: 'DMSans_600SemiBold',
  sansBold: 'DMSans_700Bold',
  // Arabic
  arDisplay: 'NotoNaskhArabic_600SemiBold', // Arabic headings
  arDisplayBold: 'NotoNaskhArabic_700Bold',
  ar: 'NotoKufiArabic_400Regular',          // Arabic text
  arMedium: 'NotoKufiArabic_500Medium',
  arSemi: 'NotoKufiArabic_600SemiBold',
  arBold: 'NotoKufiArabic_700Bold',
} as const;

export type Script = 'ar' | 'lat';
/** Arabic letters anywhere in the string → Arabic fonts; otherwise Latin. */
export const AR_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
export const scriptOf = (s: string): Script => (AR_RE.test(s) ? 'ar' : 'lat');

export type Weight = 'regular' | 'medium' | 'semi' | 'bold';
export function bodyFont(script: Script, w: Weight = 'regular') {
  if (script === 'ar') return { regular: fonts.ar, medium: fonts.arMedium, semi: fonts.arSemi, bold: fonts.arBold }[w];
  return { regular: fonts.sans, medium: fonts.sansMedium, semi: fonts.sansSemi, bold: fonts.sansBold }[w];
}

// ---------- text variants (web .t-small/.t-body/.t-name/.t-title/.t-num + label/button/tab) ----------
export type TextVariant = 'small' | 'body' | 'name' | 'title' | 'num' | 'label' | 'button' | 'buttonBig' | 'tab';

/** Font, size and line height for a variant in a script. Arabic gets roomier lines and lighter weights (web html[lang=ar]). */
export function textStyle(v: TextVariant, script: Script) {
  const ar = script === 'ar';
  const lh = (size: number, latin: number, arabic: number) => Math.round(size * (ar ? arabic : latin));
  switch (v) {
    case 'small': return { fontFamily: bodyFont(script), fontSize: fs.s, lineHeight: lh(fs.s, 1.45, 1.7) };
    case 'body': return { fontFamily: bodyFont(script), fontSize: fs.b, lineHeight: lh(fs.b, 1.55, 1.75) };
    case 'name': return { fontFamily: bodyFont(script, 'semi'), fontSize: fs.name, lineHeight: lh(fs.name, 1.35, 1.6) };
    case 'title': return { fontFamily: ar ? fonts.arDisplay : fonts.display, fontSize: fs.h, lineHeight: lh(fs.h, 1.25, 1.55) };
    // the big number: always Western digits, always Fraunces
    case 'num': return { fontFamily: fonts.display, fontSize: fs.num, lineHeight: 40, fontVariant: ['lining-nums', 'tabular-nums'] as ('lining-nums' | 'tabular-nums')[] };
    case 'label': return { fontFamily: bodyFont(script, ar ? 'medium' : 'semi'), fontSize: fs.s, lineHeight: lh(fs.s, 1.45, 1.7) };
    case 'button': return { fontFamily: bodyFont(script, ar ? 'medium' : 'semi'), fontSize: fs.b, lineHeight: lh(fs.b, 1.3, 1.6) };
    case 'buttonBig': return { fontFamily: bodyFont(script, ar ? 'medium' : 'semi'), fontSize: fs.name, lineHeight: lh(fs.name, 1.3, 1.6) };
    case 'tab': return { fontFamily: bodyFont(script, 'medium'), fontSize: fs.tab, lineHeight: lh(fs.tab, 1.3, 1.6) };
  }
}

/** Card shadow (web --shadow / --shadow-lg) as a boxShadow string (React Native 0.76+ and web). */
export function shadow(theme: ThemeName, big = false): { boxShadow: string } {
  if (theme === 'dark') return { boxShadow: big ? '0px 18px 50px rgba(0,0,0,0.55)' : '0px 10px 30px rgba(0,0,0,0.35)' };
  if (theme === 'light') return { boxShadow: big ? '0px 18px 50px rgba(60,30,20,0.16)' : '0px 1px 0px rgba(91,15,29,0.04), 0px 10px 30px rgba(40,20,20,0.06)' };
  return { boxShadow: big ? '0px 18px 50px rgba(60,30,20,0.16)' : '0px 1px 0px rgba(91,15,29,0.04), 0px 10px 30px rgba(60,30,20,0.07)' };
}

// ---------- colour mixing (web color-mix) ----------
const hex = (h: string) => { const s = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.substr(i, 2), 16) || 0); };
const toHex = (a: number[]) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
/** mix(a, b, t): t = how much of b (0..1). mix(card, ink, .08) = color-mix(ink 8%, card). Hex colours only. */
export const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
/** a hex colour with alpha, e.g. alpha('#5B0F1D', .25) */
export const alpha = (h: string, a: number) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };
