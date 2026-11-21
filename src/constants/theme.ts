/**
 * aCcountable design tokens (approved redesign, see docs/design/README.md).
 *
 * Lime has three roles because one value can't pass contrast everywhere:
 *   accent     – fills (primary buttons, selected chips, the C). Always pair with onAccent.
 *   accentLine – rings, progress bars, chart lines (≥ 3:1 on surface).
 *   accentText – links, text buttons, active tab (≥ 4.5:1 on surface).
 * Data and status hues are used as text only on `bg` or `surface`.
 */
const base = {
  dark: {
    bg: '#0C0D0B',
    surface: '#161814',
    raised: '#21241F',
    pressed: '#2C2F29',
    line: '#2A2D27',
    track: '#2C2F29',
    text: '#F2F4EC',
    text2: '#A9AD9F',
    text3: '#878B7E',
    accent: '#C6F24E',
    accentPressed: '#B0DA3C',
    onAccent: '#1A2400',
    accentLine: '#C6F24E',
    accentText: '#C6F24E',
    protein: '#FF7BAC',
    carbs: '#55C2FF',
    fat: '#FFC94D',
    training: '#A68CFF',
    trainingBg: 'rgba(166,140,255,0.16)',
    trainingSeg: 'rgba(166,140,255,0.40)',
    alert: '#FF6359',
    alertPressed: '#E9534A',
    onAlert: '#1A0705',
    warn: '#FF9F43',
    info: '#7FA8FF',
    good: '#C6F24E',
    alertBg: 'rgba(255,99,89,0.14)',
    warnBg: 'rgba(255,159,67,0.14)',
    infoBg: 'rgba(127,168,255,0.14)',
    goodBg: 'rgba(198,242,78,0.12)',
    pastFill: '#5E6257',
    switchOn: '#C6F24E',
    floatBg: 'rgba(33,36,31,0.96)',
    floatBorder: 'rgba(255,255,255,0.08)',
    shadow: 'transparent',
  },
  light: {
    bg: '#F3F4EE',
    surface: '#FFFFFF',
    raised: '#EBEDE5',
    pressed: '#DFE2D8',
    line: '#DADDD2',
    track: '#E2E4DB',
    text: '#11130E',
    text2: '#55594E',
    text3: '#686C61',
    accent: '#C6F24E',
    accentPressed: '#B0DA3C',
    onAccent: '#1A2400',
    accentLine: '#557F00',
    accentText: '#476B00',
    protein: '#C92F6B',
    carbs: '#0B73B0',
    fat: '#9A6400',
    training: '#6644D6',
    trainingBg: '#EEE9FB',
    trainingSeg: 'rgba(102,68,214,0.30)',
    alert: '#CC2E26',
    alertPressed: '#B2271F',
    onAlert: '#FFFFFF',
    warn: '#B25500',
    info: '#2D5BD1',
    good: '#476B00',
    alertBg: '#FBE7E5',
    warnBg: '#FBEDDD',
    infoBg: '#E7EDFB',
    goodBg: '#ECF4D6',
    pastFill: '#9DA194',
    switchOn: '#557F00',
    floatBg: 'rgba(255,255,255,0.97)',
    floatBorder: 'rgba(17,19,14,0.08)',
    shadow: '#11130E',
  },
} as const;

type BasePalette = { [K in keyof typeof base.dark]: string };

/**
 * Older names kept as aliases so screens not yet restyled keep working.
 * New code should use the base names above.
 */
function withAliases(p: BasePalette) {
  return {
    ...p,
    background: p.bg,
    card: p.surface,
    elevated: p.raised,
    input: p.raised,
    border: p.line,
    textMuted: p.text2,
    primary: p.accentText,
    primaryText: p.onAccent,
    success: p.good,
    danger: p.alert,
  };
}

export const Colors = { dark: withAliases(base.dark), light: withAliases(base.light) };

export type Palette = ReturnType<typeof withAliases>;
export type ThemeMode = 'dark' | 'light' | 'system';

/** 4 pt base. Screen gutter 16, card padding 16, gap between cards 12. */
export const Spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 40 } as const;

/** Bars 3 · badges 10 · inputs 14 · big buttons 18 · cards 20–22 · hero 24 · pill. */
export const Radius = { xs: 3, sm: 10, md: 14, lg: 18, card: 22, hero: 24, pill: 999 } as const;

export const Fonts = {
  numBold: 'Archivo_700Bold',
  numHeavy: 'Archivo_800ExtraBold',
} as const;

/**
 * Type. Words: SF Pro (system). Numbers: Archivo with tabular figures.
 */
export const Type = {
  numDisplay: { fontFamily: Fonts.numHeavy, fontSize: 96, lineHeight: 100, letterSpacing: -3.5 },
  numHero: { fontFamily: Fonts.numHeavy, fontSize: 52, lineHeight: 56, letterSpacing: -1.5 },
  numXL: { fontFamily: Fonts.numHeavy, fontSize: 40, lineHeight: 44, letterSpacing: -1 },
  numL: { fontFamily: Fonts.numHeavy, fontSize: 28, lineHeight: 32, letterSpacing: -0.5 },
  numM: { fontFamily: Fonts.numHeavy, fontSize: 22, lineHeight: 26 },
  numS: { fontFamily: Fonts.numBold, fontSize: 17, lineHeight: 22 },
  numXS: { fontFamily: Fonts.numBold, fontSize: 15, lineHeight: 20 },
  numXXS: { fontFamily: Fonts.numBold, fontSize: 13, lineHeight: 18 },
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.4 },
  title: { fontSize: 20, lineHeight: 25, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
} as const;
