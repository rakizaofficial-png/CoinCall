import type { BeautyPreset } from '../services/agoraTypes';

export type LiveFilter = {
  id: BeautyPreset;
  label: string;
  shortLabel: string;
  description: string;
};

export const LIVE_FILTERS: LiveFilter[] = [
  {
    id: 'natural',
    label: 'Natural',
    shortLabel: 'Soft',
    description: 'Soft skin and balanced light',
  },
  {
    id: 'glamour',
    label: 'Glamour',
    shortLabel: 'Glam',
    description: 'Bright skin with rosy tone',
  },
  {
    id: 'snap',
    label: 'Snap AR',
    shortLabel: 'Snap',
    description: 'Strong social live beauty',
  },
  {
    id: 'porcelain',
    label: 'Porcelain',
    shortLabel: 'Doll',
    description: 'Very smooth, bright face filter',
  },
  {
    id: 'neon',
    label: 'Neon',
    shortLabel: 'Pop',
    description: 'High color and sharp live look',
  },
  {
    id: 'deep_ar',
    label: 'Deep AR',
    shortLabel: 'Deep',
    description: 'Heavy AR-style beauty preset',
  },
];

export const DEFAULT_LIVE_FILTER: BeautyPreset = 'deep_ar';

