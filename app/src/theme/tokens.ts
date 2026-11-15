// Design tokens from the RSVP design system (pastel palette, Nov 2026).
// Same names as the design system's tokens.json, so designs and code match.

export type ThemeName = 'light' | 'cream' | 'dark';

const palette = {
  forest: '#2F3E2F',
  blush: '#E8B5B7',
  powder: '#C7D8E8',
  cream: '#F4EDE3',
  white: '#FFFFFF',
  black: '#121412',
};

export type Colors = {
  bg: string; surface: string; surfaceRaised: string;
  ink: string; inkMuted: string; line: string; lineControl: string;
  primary: string; onPrimary: string; primarySoft: string;
  secondary: string; tertiary: string; onAccent: string;
  powderSoft: string; powderInk: string; blushInk: string;
  ok: string; okSoft: string; wait: string; waitSoft: string; no: string; noSoft: string;
  scrim: string;
};

export const colors: Record<ThemeName, Colors> = {
  light: {
    bg: '#FFFFFF', surface: '#F8F4EE', surfaceRaised: '#FFFFFF',
    ink: '#1E241E', inkMuted: '#5E645C', line: '#E9E3DA', lineControl: '#8B8F87',
    primary: palette.forest, onPrimary: '#FFFFFF', primarySoft: '#F6E2E3',
    secondary: palette.blush, tertiary: palette.powder, onAccent: '#1E241E',
    powderSoft: '#E4EDF6', powderInk: '#2D4A66', blushInk: '#8A3B41',
    ok: '#2E6B47', okSoft: '#E3F1E8', wait: '#7A4A00', waitSoft: '#FBEFD7', no: '#9B2C2C', noSoft: '#FAE3E3',
    scrim: '#1E241E',
  },
  cream: {
    bg: palette.cream, surface: '#FBF7F1', surfaceRaised: '#FFFFFF',
    ink: '#1E241E', inkMuted: '#575C54', line: '#E2D8CB', lineControl: '#85877F',
    primary: palette.forest, onPrimary: '#FFFFFF', primarySoft: '#EED5D5',
    secondary: palette.blush, tertiary: palette.powder, onAccent: '#1E241E',
    powderSoft: '#DCE6F0', powderInk: '#2A4560', blushInk: '#7E333A',
    ok: '#2A6142', okSoft: '#D9E8DD', wait: '#6B4100', waitSoft: '#F1E2C4', no: '#8E2424', noSoft: '#F1D5D2',
    scrim: '#1E241E',
  },
  dark: {
    bg: palette.black, surface: '#1C1F1C', surfaceRaised: '#252825',
    ink: '#F4EDE3', inkMuted: '#B9B5AE', line: '#343834', lineControl: '#7B7E78',
    primary: palette.blush, onPrimary: '#1E241E', primarySoft: '#3A2528',
    secondary: palette.blush, tertiary: palette.powder, onAccent: '#1E241E',
    powderSoft: '#1F2832', powderInk: '#C7D8E8', blushInk: '#E8B5B7',
    ok: '#8FD1A8', okSoft: '#1C3024', wait: '#E8C47D', waitSoft: '#3A2D19', no: '#F0A0A6', noSoft: '#3E1D22',
    scrim: '#000000',
  },
};

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 } as const;
export const radius = { sm: 8, md: 14, lg: 18, xl: 24, pill: 999 } as const;

// Font family names as loaded in src/app/_layout.tsx.
export const fonts = {
  display: 'CormorantGaramond_600SemiBold',
  displayMedium: 'CormorantGaramond_500Medium',
  sans: 'DMSans_400Regular',
  sansBold: 'DMSans_600SemiBold',
  sansHeavy: 'DMSans_700Bold',
  arabic: 'IBMPlexSansArabic_400Regular',
  arabicBold: 'IBMPlexSansArabic_600SemiBold',
  arabicDisplay: 'MarkaziText_600SemiBold',
};

// Text styles from the design system. Arabic gets taller line heights.
export type TextVariant = 'heading1' | 'heading2' | 'title' | 'body' | 'label' | 'caption' | 'button' | 'stat';

export function textStyle(variant: TextVariant, rtl: boolean) {
  const f = rtl
    ? { display: fonts.arabicDisplay, regular: fonts.arabic, bold: fonts.arabicBold, heavy: fonts.arabicBold }
    : { display: fonts.display, regular: fonts.sans, bold: fonts.sansBold, heavy: fonts.sansHeavy };
  const ar = (lh: number) => (rtl ? Math.round(lh * 1.25) : lh);
  switch (variant) {
    case 'heading1': return { fontFamily: f.display, fontSize: rtl ? 32 : 34, lineHeight: rtl ? 46 : 38 };
    case 'heading2': return { fontFamily: f.display, fontSize: rtl ? 26 : 27, lineHeight: rtl ? 38 : 30 };
    case 'title': return { fontFamily: f.bold, fontSize: 17, lineHeight: ar(24) };
    case 'body': return { fontFamily: f.regular, fontSize: 15, lineHeight: ar(22) };
    case 'label': return { fontFamily: f.bold, fontSize: 13, lineHeight: ar(18) };
    case 'caption': return { fontFamily: f.regular, fontSize: 12, lineHeight: ar(16) };
    case 'button': return { fontFamily: f.bold, fontSize: 16, lineHeight: ar(20) };
    case 'stat': return { fontFamily: f.heavy, fontSize: 26, lineHeight: ar(30) };
  }
}
