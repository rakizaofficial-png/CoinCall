/** Shared Agora types used by web + native implementations */

export type BeautyPreset =
  | 'off'
  | 'natural'
  | 'glamour'
  | 'snap'
  | 'porcelain'
  | 'neon'
  | 'deep_ar'
  | 'skin_whitening'
  | 'soft_pink_glow'
  | 'face_slim_young'
  | 'bright_eyes_teeth'
  | 'k_beauty'
  | 'blush_highlight'
  | 'fashion_aviators'
  | 'golden_flower_crown'
  | 'bokeh_blur';

export const BEAUTY_PRESETS: Record<
  Exclude<BeautyPreset, 'off'>,
  {
    lighteningContrastLevel: 0 | 1 | 2;
    lighteningLevel: number;
    smoothnessLevel: number;
    sharpnessLevel: number;
    rednessLevel: number;
  }
> = {
  natural: {
    lighteningContrastLevel: 1,
    lighteningLevel: 0.55,
    smoothnessLevel: 0.55,
    sharpnessLevel: 0.35,
    rednessLevel: 0.12,
  },
  glamour: {
    lighteningContrastLevel: 1,
    lighteningLevel: 0.78,
    smoothnessLevel: 0.88,
    sharpnessLevel: 0.42,
    rednessLevel: 0.28,
  },
  snap: {
    lighteningContrastLevel: 2,
    lighteningLevel: 0.82,
    smoothnessLevel: 0.92,
    sharpnessLevel: 0.48,
    rednessLevel: 0.32,
  },
  porcelain: {
    lighteningContrastLevel: 2,
    lighteningLevel: 0.9,
    smoothnessLevel: 0.96,
    sharpnessLevel: 0.32,
    rednessLevel: 0.2,
  },
  neon: {
    lighteningContrastLevel: 2,
    lighteningLevel: 0.72,
    smoothnessLevel: 0.84,
    sharpnessLevel: 0.58,
    rednessLevel: 0.36,
  },
  deep_ar: {
    lighteningContrastLevel: 2,
    lighteningLevel: 0.95,
    smoothnessLevel: 1,
    sharpnessLevel: 0.5,
    rednessLevel: 0.42,
  },
  skin_whitening: {
    lighteningContrastLevel: 2,
    lighteningLevel: 0.96,
    smoothnessLevel: 0.98,
    sharpnessLevel: 0.34,
    rednessLevel: 0.12,
  },
  soft_pink_glow: {
    lighteningContrastLevel: 1,
    lighteningLevel: 0.84,
    smoothnessLevel: 0.9,
    sharpnessLevel: 0.36,
    rednessLevel: 0.34,
  },
  face_slim_young: {
    lighteningContrastLevel: 2,
    lighteningLevel: 0.86,
    smoothnessLevel: 0.94,
    sharpnessLevel: 0.42,
    rednessLevel: 0.22,
  },
  bright_eyes_teeth: {
    lighteningContrastLevel: 2,
    lighteningLevel: 0.82,
    smoothnessLevel: 0.8,
    sharpnessLevel: 0.58,
    rednessLevel: 0.16,
  },
  k_beauty: {
    lighteningContrastLevel: 2,
    lighteningLevel: 0.98,
    smoothnessLevel: 1,
    sharpnessLevel: 0.28,
    rednessLevel: 0.18,
  },
  blush_highlight: {
    lighteningContrastLevel: 1,
    lighteningLevel: 0.78,
    smoothnessLevel: 0.88,
    sharpnessLevel: 0.38,
    rednessLevel: 0.44,
  },
  fashion_aviators: {
    lighteningContrastLevel: 1,
    lighteningLevel: 0.72,
    smoothnessLevel: 0.82,
    sharpnessLevel: 0.48,
    rednessLevel: 0.22,
  },
  golden_flower_crown: {
    lighteningContrastLevel: 1,
    lighteningLevel: 0.8,
    smoothnessLevel: 0.9,
    sharpnessLevel: 0.4,
    rednessLevel: 0.3,
  },
  bokeh_blur: {
    lighteningContrastLevel: 1,
    lighteningLevel: 0.76,
    smoothnessLevel: 0.82,
    sharpnessLevel: 0.44,
    rednessLevel: 0.18,
  },
};

export type StartAgoraCallOptions = {
  channel: string;
  /** Web DOM surfaces — ignored on native (uses RtcSurfaceView) */
  localVideoEl?: HTMLElement;
  remoteVideoEl?: HTMLElement;
  uid?: number;
  token?: string;
  appId?: string;
  beauty?: BeautyPreset;
};
