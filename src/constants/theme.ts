/**
 * aCcountable palette: dark-first, high-contrast, data-focused. One vivid
 * accent (mint) for progress and actions, and a distinct colour per macro so
 * rings and numbers read at a glance.
 */
export const Colors = {
  dark: {
    background: '#000000',
    card: '#111113',
    elevated: '#1B1B1E',
    text: '#F5F5F7',
    textMuted: '#8E8E96',
    border: '#24242A',
    input: '#1B1B1E',
    primary: '#3DDC97',
    primaryText: '#04150D',
    training: '#B98CFF',
    success: '#3DDC97',
    danger: '#FF5A5F',
    protein: '#FF7A6B',
    carbs: '#4CC9F0',
    fat: '#FFC857',
    track: '#232328',
  },
  light: {
    background: '#F2F2F5',
    card: '#FFFFFF',
    elevated: '#F7F7F9',
    text: '#0E0E10',
    textMuted: '#6B6B73',
    border: '#E4E4E9',
    input: '#EEEEF2',
    primary: '#12A66A',
    primaryText: '#FFFFFF',
    training: '#7C4DDB',
    success: '#12A66A',
    danger: '#E0353B',
    protein: '#E5533F',
    carbs: '#1696C9',
    fat: '#D99A0B',
    track: '#E6E6EB',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.dark]: string };
export type ThemeMode = 'dark' | 'light' | 'system';

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const Radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;
