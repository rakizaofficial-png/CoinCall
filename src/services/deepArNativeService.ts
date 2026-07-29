import { Platform } from 'react-native';
import { env } from '../config/env';
import { LIVE_FILTERS } from '../data/liveFilters';
import type { BeautyPreset } from './agoraTypes';

const DEEPAR_SLOT = 'host_beauty_glamour';

type DeepARHandle = {
  switchEffect: (params: { mask: string; slot?: string }) => void;
  switchEffectWithPath: (params: { path: string; slot?: string }) => void;
  changeParameterFloat: (params: {
    gameObject: string;
    component: string;
    parameter: string;
    value: number;
  }) => void;
  setFaceDetectionSensitivity: (sensitivity: number) => void;
  setLiveMode: (enabled: boolean) => void;
  pause: () => void;
  resume: () => void;
};

let deepARRef: DeepARHandle | null = null;
let currentPreset: BeautyPreset = 'skin_whitening';
let currentIntensity = 0.82;

export function getDeepARLicenseKey() {
  return Platform.OS === 'android'
    ? env.deepar.androidLicenseKey
    : env.deepar.webLicenseKey;
}

export function resolveDeepAREffect(preset: BeautyPreset) {
  return LIVE_FILTERS.find((item) => item.id === preset)?.asset || '';
}

export function registerDeepARView(ref: DeepARHandle | null) {
  deepARRef = ref;
  if (deepARRef) {
    deepARRef.setLiveMode(true);
    deepARRef.setFaceDetectionSensitivity(3);
    switchNativeDeepAREffect(currentPreset);
    setNativeDeepARBeautyIntensity(currentIntensity);
  }
}

export function switchNativeDeepAREffect(preset: BeautyPreset) {
  currentPreset = preset;
  if (!deepARRef || preset === 'off' || preset === 'natural') return false;
  const effect = resolveDeepAREffect(preset);
  if (!effect) return false;
  if (/^https?:\/\//i.test(effect) || effect.startsWith('/')) {
    deepARRef.switchEffectWithPath({ path: effect, slot: DEEPAR_SLOT });
  } else {
    deepARRef.switchEffect({ mask: effect, slot: DEEPAR_SLOT });
  }
  setNativeDeepARBeautyIntensity(currentIntensity);
  return true;
}

export function setNativeDeepARBeautyIntensity(intensity: number) {
  currentIntensity = Math.max(0, Math.min(1, intensity));
  if (!deepARRef) return false;
  const variables = [
    'skinSmoothing',
    'skinWhitening',
    'faceSlim',
    'youngify',
    'eyesWhitening',
    'teethWhitening',
  ];
  for (const parameter of variables) {
    try {
      deepARRef.changeParameterFloat({
        gameObject: 'BeautyController',
        component: 'Beauty',
        parameter,
        value: currentIntensity,
      });
    } catch {
      /* The loaded .deepar effect may not expose this parameter. */
    }
  }
  return true;
}

export function pauseNativeDeepAR() {
  try {
    deepARRef?.pause();
  } catch {
    /* ignore */
  }
}

export function resumeNativeDeepAR() {
  try {
    deepARRef?.resume();
  } catch {
    /* ignore */
  }
}
