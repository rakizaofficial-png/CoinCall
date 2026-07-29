import { Platform } from 'react-native';
import { env } from '../config/env';
import { LIVE_FILTERS } from '../data/liveFilters';
import type { BeautyPreset } from './agoraTypes';

type DeepARInstance = {
  getCanvas: () => HTMLCanvasElement;
  startCamera: (options?: {
    mirror?: boolean;
    mediaStreamConstraints?: MediaStreamConstraints;
  }) => Promise<void>;
  stopCamera: () => void;
  shutdown: () => void;
  setFps?: (fps: number) => void;
  setFaceDetectionSensitivity?: (sensitivity: number) => void;
  backgroundBlur?: (enable: boolean, strength: number) => Promise<void>;
  switchEffect?: (effect: string | ArrayBufferLike, effectOptions?: { slot?: string; face?: number }) => Promise<void>;
  clearEffect?: (slot?: string) => void;
  changeParameterFloat?: (
    gameObject: string,
    component: string,
    parameter: string,
    value: number,
  ) => void;
  setExposure?: (value: number) => void;
  setBloomEnabled?: (enabled: boolean) => void;
  setBloomStrength?: (value: number) => void;
};

export type DeepARSession = {
  deepAR: DeepARInstance;
  stream: MediaStream;
  videoTrack: MediaStreamTrack;
  stop: () => void;
};

const DEEPAR_SLOT = 'host_beauty_glamour';

const LEGACY_DEEPAR_EFFECTS: Partial<Record<BeautyPreset, string>> = {
  glamour: 'aviators',
  snap: 'koala',
  porcelain: 'dalmatian',
  neon: 'galaxy_background',
  deep_ar: 'lion',
};

function effectUrl(preset: BeautyPreset) {
  const filter = LIVE_FILTERS.find((item) => item.id === preset);
  const effect = filter?.asset || LEGACY_DEEPAR_EFFECTS[preset];
  if (!effect) return undefined;
  if (/^https?:\/\//i.test(effect)) return effect;
  return `${env.deepar.effectBaseUrl.replace(/\/$/, '')}/${effect.replace(/^\//, '')}`;
}

export function shouldUseDeepARWeb(preset: BeautyPreset) {
  return Platform.OS === 'web' && Boolean(env.deepar.webLicenseKey) && preset !== 'off' && preset !== 'natural';
}

export async function startDeepARWebLive(
  hostElement: HTMLElement,
  preset: BeautyPreset,
): Promise<DeepARSession> {
  if (Platform.OS !== 'web') {
    throw new Error('DeepAR web filters run only in the web host studio.');
  }
  if (!env.deepar.webLicenseKey) {
    throw new Error('Missing DeepAR web license key.');
  }

  hostElement.replaceChildren();
  const deepar = (await import('deepar') as unknown) as {
    initialize: (params: Record<string, unknown>) => Promise<DeepARInstance>;
  };
  const deepAR = await deepar.initialize({
    licenseKey: env.deepar.webLicenseKey,
    previewElement: hostElement,
    rootPath: env.deepar.rootPath,
    effect: effectUrl(preset),
    additionalOptions: { hint: 'faceInit' },
  });
  deepAR.setFps?.(30);
  deepAR.setFaceDetectionSensitivity?.(3);
  await applyDeepARBeautyRuntime(deepAR, preset, 0.82);
  await deepAR.startCamera({
    mirror: true,
    mediaStreamConstraints: {
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
  });

  const canvas = deepAR.getCanvas();
  const stream = canvas.captureStream(30);
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) {
    deepAR.shutdown();
    throw new Error('DeepAR did not provide a video track.');
  }

  return {
    deepAR,
    stream,
    videoTrack,
    stop: () => {
      try {
        stream.getTracks().forEach((track) => track.stop());
        deepAR.stopCamera();
        deepAR.shutdown();
      } catch {
        /* best effort cleanup */
      }
    },
  };
}

export async function switchDeepAREffect(
  session: DeepARSession | null | undefined,
  preset: BeautyPreset,
  intensity = 0.82,
) {
  if (!session?.deepAR || Platform.OS !== 'web') return false;
  const effect = effectUrl(preset);
  try {
    if (effect && preset !== 'off' && preset !== 'natural') {
      await session.deepAR.switchEffect?.(effect, { slot: DEEPAR_SLOT, face: 0 });
    } else {
      session.deepAR.clearEffect?.(DEEPAR_SLOT);
    }
    await applyDeepARBeautyRuntime(session.deepAR, preset, intensity);
    return true;
  } catch (e) {
    console.warn('[deepar] switchEffect failed', e);
    return false;
  }
}

export async function setDeepARBeautyIntensity(
  session: DeepARSession | null | undefined,
  preset: BeautyPreset,
  intensity: number,
) {
  if (!session?.deepAR || Platform.OS !== 'web') return false;
  try {
    await applyDeepARBeautyRuntime(session.deepAR, preset, intensity);
    return true;
  } catch (e) {
    console.warn('[deepar] intensity update failed', e);
    return false;
  }
}

async function applyDeepARBeautyRuntime(
  deepAR: DeepARInstance,
  preset: BeautyPreset,
  intensity: number,
) {
  const level = Math.max(0, Math.min(1, intensity));
  const blurStrength = preset === 'bokeh_blur' ? Math.max(2, Math.round(5 * level)) : 0;
  await deepAR.backgroundBlur?.(preset === 'bokeh_blur', blurStrength).catch(() => undefined);
  deepAR.setExposure?.(preset === 'k_beauty' || preset === 'skin_whitening' ? 0.08 + level * 0.16 : level * 0.08);
  deepAR.setBloomEnabled?.(preset !== 'off');
  deepAR.setBloomStrength?.(preset === 'soft_pink_glow' || preset === 'blush_highlight' ? 0.2 + level * 0.45 : level * 0.22);

  // These parameter names are safe no-ops unless the .deepar asset exposes them.
  // DeepAR Studio effects can bind these names for true skin smoothing/whitening intensity.
  const variables = [
    ['BeautyController', 'Beauty', 'skinSmoothing'],
    ['BeautyController', 'Beauty', 'skinWhitening'],
    ['BeautyController', 'Beauty', 'faceSlim'],
    ['BeautyController', 'Beauty', 'youngify'],
    ['BeautyController', 'Beauty', 'eyesWhitening'],
    ['BeautyController', 'Beauty', 'teethWhitening'],
  ] as const;
  for (const [node, component, parameter] of variables) {
    try {
      deepAR.changeParameterFloat?.(node, component, parameter, level);
    } catch {
      /* Effect does not expose this parameter. */
    }
  }
}
