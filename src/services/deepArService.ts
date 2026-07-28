import { Platform } from 'react-native';
import { env } from '../config/env';
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
};

export type DeepARSession = {
  deepAR: DeepARInstance;
  stream: MediaStream;
  videoTrack: MediaStreamTrack;
  stop: () => void;
};

const DEEPAR_EFFECTS: Partial<Record<BeautyPreset, string>> = {
  glamour: 'aviators',
  snap: 'koala',
  porcelain: 'dalmatian',
  neon: 'galaxy_background',
  deep_ar: 'lion',
};

function effectUrl(preset: BeautyPreset) {
  const effect = DEEPAR_EFFECTS[preset];
  return effect ? `${env.deepar.effectBaseUrl}${effect}` : undefined;
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
  if (preset === 'neon') {
    await deepAR.backgroundBlur?.(true, 3).catch(() => undefined);
  }
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
