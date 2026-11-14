export const Colors = {
  light: {
    background: '#F4F5F7',
    card: '#FFFFFF',
    text: '#111418',
    textMuted: '#626B76',
    border: '#E2E5EA',
    input: '#F0F2F5',
    primary: '#2F6BFF',
    primaryText: '#FFFFFF',
    training: '#F07A1A',
    success: '#1E9E62',
    danger: '#D93B3B',
    protein: '#7A5AF8',
    carbs: '#2F9BD6',
    fat: '#E0A21B',
    track: '#E7EAEE',
  },
  dark: {
    background: '#0C0E11',
    card: '#171A1F',
    text: '#F2F4F7',
    textMuted: '#9AA3AE',
    border: '#2A2F36',
    input: '#22262C',
    primary: '#5A8BFF',
    primaryText: '#FFFFFF',
    training: '#FF9440',
    success: '#3CC488',
    danger: '#FF6464',
    protein: '#9D85FF',
    carbs: '#55B8EE',
    fat: '#F2BC45',
    track: '#2A2F36',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const Radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
