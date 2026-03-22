export const colors = {
  primary: '#1B4F72',
  primaryLight: '#2E86C1',
  primaryDark: '#154360',
  accent: '#D6EAF8',
  accentLight: '#EBF5FB',

  success: '#27AE60',
  successLight: '#E8F8F0',
  warning: '#F39C12',
  warningLight: '#FEF5E7',
  danger: '#E74C3C',
  dangerLight: '#FDEDEC',

  background: '#F8FAFC',
  surface: '#FFFFFF',
  card: '#FFFFFF',

  foreground: '#1E293B',
  muted: '#64748B',
  mutedLight: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
} as const;

export const fontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};
