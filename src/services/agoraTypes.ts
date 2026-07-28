/** Shared Agora types used by web + native implementations */

export type BeautyPreset =
  | 'off'
  | 'natural'
  | 'glamour'
  | 'snap'
  | 'porcelain'
  | 'neon'
  | 'deep_ar';

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
};

/** CSS for local PiP preview (web only) */
export function beautyCssFilter(preset: BeautyPreset): string {
  if (preset === 'off') return 'none';
  if (preset === 'natural') {
    return 'brightness(1.08) contrast(1.04) saturate(1.12) blur(0.25px)';
  }
  if (preset === 'glamour') {
    return 'brightness(1.14) contrast(1.06) saturate(1.22) blur(0.4px)';
  }
  if (preset === 'snap') {
    return 'brightness(1.18) contrast(1.08) saturate(1.28) blur(0.55px)';
  }
  if (preset === 'porcelain') {
    return 'brightness(1.2) contrast(1.02) saturate(1.08) blur(0.8px)';
  }
  if (preset === 'neon') {
    return 'brightness(1.1) contrast(1.16) saturate(1.45) hue-rotate(-8deg)';
  }
  return 'brightness(1.23) contrast(1.12) saturate(1.38) blur(0.65px)';
}

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
