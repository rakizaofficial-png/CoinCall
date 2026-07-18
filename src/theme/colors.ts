/** Premium 2026 palette — blue / violet system, dark + light */

export type ColorSchemeName = 'dark' | 'light';

export type AppColors = {
  bg: string;
  bgElevated: string;
  bgCard: string;
  bgSoft: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primarySoft: string;
  accent: string;
  blush: string;
  online: string;
  danger: string;
  success: string;
  gradientStart: string;
  gradientMid: string;
  gradientEnd: string;
  tabInactive: string;
  tabActive: string;
  glass: string;
  glassBorder: string;
  shadow: string;
  overlay: string;
  cyberGold: string;
  velvet: string;
};

export const darkColors: AppColors = {
  bg: '#070A14',
  bgElevated: '#0E1424',
  bgCard: '#141C2E',
  bgSoft: '#1C2740',
  border: 'rgba(148,163,255,0.18)',
  text: '#F4F7FF',
  textSecondary: '#B8C0E0',
  textMuted: '#7E89B0',
  primary: '#6C7CFF',
  primarySoft: '#9B8CFF',
  accent: '#5CE1E6',
  blush: '#C4B5FD',
  online: '#34D399',
  danger: '#FF6B8A',
  success: '#34D399',
  gradientStart: '#4F6BFF',
  gradientMid: '#7C5CFF',
  gradientEnd: '#B45CFF',
  tabInactive: '#7E89B0',
  tabActive: '#9B8CFF',
  glass: 'rgba(20, 28, 46, 0.72)',
  glassBorder: 'rgba(156, 163, 255, 0.22)',
  shadow: 'rgba(79, 107, 255, 0.35)',
  overlay: 'rgba(4, 8, 18, 0.55)',
  cyberGold: '#5CE1E6',
  velvet: '#0E1424',
};

export const lightColors: AppColors = {
  bg: '#F5F7FF',
  bgElevated: '#FFFFFF',
  bgCard: '#FFFFFF',
  bgSoft: '#EEF1FF',
  border: 'rgba(79,107,255,0.14)',
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  primary: '#4F6BFF',
  primarySoft: '#7C5CFF',
  accent: '#0EA5E9',
  blush: '#A78BFA',
  online: '#10B981',
  danger: '#EF4444',
  success: '#10B981',
  gradientStart: '#4F6BFF',
  gradientMid: '#7C5CFF',
  gradientEnd: '#A855F7',
  tabInactive: '#94A3B8',
  tabActive: '#4F6BFF',
  glass: 'rgba(255, 255, 255, 0.78)',
  glassBorder: 'rgba(79, 107, 255, 0.16)',
  shadow: 'rgba(79, 107, 255, 0.18)',
  overlay: 'rgba(15, 23, 42, 0.35)',
  cyberGold: '#0EA5E9',
  velvet: '#FFFFFF',
};

/** Backward-compatible default (dark) — used by screens not yet on useTheme */
export const colors: AppColors = darkColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
} as const;

export const radii = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  full: 999,
} as const;

export const typography = {
  hero: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -0.6 },
  title: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.4 },
  subtitle: { fontSize: 16, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '600' as const },
  label: { fontSize: 13, fontWeight: '700' as const },
};
