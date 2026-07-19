/** CoinCall Host — 2026 premium visual system (rose ink + teal signal) */

export const premium = {
  ink: '#07090F',
  inkElevated: '#0E121B',
  inkSoft: '#161C2A',
  mist: 'rgba(255,255,255,0.04)',
  line: 'rgba(255,255,255,0.10)',
  lineStrong: 'rgba(255,255,255,0.16)',
  text: '#F7F4F0',
  textSoft: '#B8B2A8',
  textMute: '#7A756C',
  rose: '#FF4D6D',
  roseDeep: '#E11D48',
  teal: '#2DD4BF',
  gold: '#E8C47C',
  success: '#34D399',
  danger: '#FB7185',
  gradHero: ['#1A1020', '#0B1A22', '#07090F'] as const,
  gradRose: ['#FF6B8A', '#FF4D6D', '#E11D48'] as const,
  gradTeal: ['#5EEAD4', '#2DD4BF', '#0D9488'] as const,
  gradCard: ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)'] as const,
  glass: 'rgba(18, 22, 34, 0.72)',
  shadow: 'rgba(255, 77, 109, 0.22)',
  fonts: {
    display: 'Fraunces',
    body: 'DM Sans',
  },
  radius: {
    sm: 14,
    md: 18,
    lg: 24,
    xl: 28,
    pill: 999,
  },
} as const;

export const premiumSpace = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
} as const;
