import type { BeautyPreset } from '../services/agoraTypes';

export type LiveFilter = {
  id: BeautyPreset;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
  supportsIntensity?: boolean;
};

export const LIVE_FILTERS: LiveFilter[] = [
  {
    id: 'skin_whitening',
    label: 'Skin Whitening & Smoothing',
    shortLabel: 'Whitening',
    icon: '✨',
    description: 'Fairer complexion, soft poreless skin',
    supportsIntensity: true,
  },
  {
    id: 'glamour',
    label: 'Glam Beauty',
    shortLabel: 'Glam',
    icon: '💄',
    description: 'Subtle lip, cheek and full glamour retouch',
    supportsIntensity: true,
  },
  {
    id: 'soft_pink_glow',
    label: 'Soft Pink Glow',
    shortLabel: 'Glow',
    icon: '🌸',
    description: 'Bright fresh portrait lighting',
    supportsIntensity: true,
  },
  {
    id: 'face_slim_young',
    label: 'Face Slim & Youngify',
    shortLabel: 'Slim Face',
    icon: '🪞',
    description: 'Contoured slim face and youthful polish',
    supportsIntensity: true,
  },
  {
    id: 'bright_eyes_teeth',
    label: 'Bright Eyes & Teeth',
    shortLabel: 'Bright',
    icon: '👁️',
    description: 'Gleaming eyes and brighter smile',
    supportsIntensity: true,
  },
  {
    id: 'k_beauty',
    label: 'K-Beauty Porcelain Skin',
    shortLabel: 'K-Beauty',
    icon: '🫧',
    description: 'Crystal clear light porcelain tone',
    supportsIntensity: true,
  },
  {
    id: 'blush_highlight',
    label: 'Blush & Highlights',
    shortLabel: 'Blush',
    icon: '🌟',
    description: 'Glowy skin, blush and highlight finish',
    supportsIntensity: true,
  },
  {
    id: 'fashion_aviators',
    label: '3D Fashion Aviators',
    shortLabel: 'Aviators',
    icon: '🕶️',
    description: 'Stylish 3D glasses with clean beauty',
  },
  {
    id: 'golden_flower_crown',
    label: 'Golden Flower Crown',
    shortLabel: 'Crown',
    icon: '👑',
    description: 'Golden floral 3D accessory overlay',
  },
  {
    id: 'bokeh_blur',
    label: 'Bokeh Background Blur',
    shortLabel: 'Bokeh',
    icon: '📷',
    description: 'Blurred background, host in sharp focus',
    supportsIntensity: true,
  },
];

export const DEFAULT_LIVE_FILTER: BeautyPreset = 'skin_whitening';
