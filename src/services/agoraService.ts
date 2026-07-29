import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { Platform } from 'react-native';
import { env } from '../config/env';
import {
  BEAUTY_PRESETS,
  type BeautyPreset,
} from './agoraTypes';

export function isAgoraConfigured() {
  return Boolean(env.apiBaseUrl);
}

/** Stubs so TypeScript resolves shared imports; native override supplies real impl */
export function getNativeRemoteUid(): number | null {
  return null;
}

export function subscribeNativeRemoteUid(
  listener: (uid: number | null) => void,
) {
  listener(null);
  return () => undefined;
}

export type { BeautyPreset } from './agoraTypes';
export { BEAUTY_PRESETS } from './agoraTypes';

type LiveSession = {
  client: IAgoraRTCClient;
  mic: IMicrophoneAudioTrack | null;
  cam: ICameraVideoTrack | null;
  beautyProcessor: any | null;
  beautyPreset: BeautyPreset;
};

let session: LiveSession | null = null;
let beautyRegistered = false;
let beautyExtension: any = null;
let currentPreset: BeautyPreset = 'snap';
let currentDeepARIntensity = 0.82;

function apiRoot() {
  const raw = (env.apiBaseUrl || 'https://coincall-api.onrender.com/api').replace(
    /\/$/,
    '',
  );
  if (
    typeof window !== 'undefined' &&
    (window.location?.hostname ?? '').includes('onrender.com') &&
    raw.includes('localhost')
  ) {
    return 'https://coincall-api.onrender.com/api';
  }
  return raw;
}

async function fetchRtcToken(
  channel: string,
  uid = 0,
  role: 'publisher' | 'subscriber' = 'publisher',
) {
  const url = `${apiRoot()}/agora/token?channel=${encodeURIComponent(channel)}&uid=${uid}&role=${role}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token server error: ${body || res.status}`);
  }
  return (await res.json()) as {
    token: string;
    appId: string;
    uid: number;
    channel: string;
  };
}

function prepVideoEl(el: HTMLElement) {
  el.style.width = '100%';
  el.style.height = '100%';
  el.style.background = '#000';
  el.style.overflow = 'hidden';
  el.replaceChildren();
}

function applyLocalCssBeauty(preset: BeautyPreset) {
  void preset;
}

async function ensureBeautyProcessor(AgoraRTC: any) {
  try {
    const BeautyExtension = (await import('agora-extension-beauty-effect')).default;
    if (!beautyExtension) beautyExtension = new BeautyExtension();
    if (!beautyRegistered) {
      AgoraRTC.registerExtensions([beautyExtension]);
      beautyRegistered = true;
    }
    return beautyExtension.createProcessor();
  } catch (e) {
    console.warn('Beauty extension unavailable', e);
    return null;
  }
}

async function pipeBeauty(
  cam: ICameraVideoTrack,
  processor: any,
  preset: BeautyPreset,
) {
  if (!processor || !cam) return;
  try {
    cam.pipe(processor).pipe(cam.processorDestination);
    if (preset === 'off') {
      await processor.disable?.();
      return;
    }
    const opts = BEAUTY_PRESETS[preset];
    processor.setOptions(opts);
    await processor.enable();
  } catch (e) {
    console.warn('Beauty pipe failed', e);
  }
}

async function createMicAndCam(AgoraRTC: any, encoder: string, facingMode?: string) {
  const videoConfig: any = { encoderConfig: encoder };
  if (facingMode) videoConfig.facingMode = facingMode;
  return AgoraRTC.createMicrophoneAndCameraTracks({}, videoConfig) as Promise<
    [IMicrophoneAudioTrack, ICameraVideoTrack]
  >;
}

/**
 * Web-only Agora join. Prefer passing token/appId from /calls/:id/token.
 */
export async function startAgoraCall(options: {
  channel: string;
  localVideoEl?: HTMLElement | null;
  remoteVideoEl?: HTMLElement | null;
  uid?: number;
  token?: string;
  appId?: string;
  beauty?: BeautyPreset;
}) {
  if (Platform.OS !== 'web') {
    throw new Error(
      'Native video uses agoraService.native — rebuild with EAS Dev Client.',
    );
  }
  if (!apiRoot()) {
    throw new Error('Missing API base URL for Agora token');
  }
  if (!options.localVideoEl || !options.remoteVideoEl) {
    throw new Error('Video surfaces not ready');
  }

  await stopAgoraCall();
  prepVideoEl(options.localVideoEl);
  prepVideoEl(options.remoteVideoEl);

  const tokenPayload =
    options.token && options.appId
      ? {
          token: options.token,
          appId: options.appId,
          uid: options.uid ?? 0,
          channel: options.channel,
        }
      : await fetchRtcToken(options.channel, options.uid ?? 0, 'publisher');

  const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
  AgoraRTC.setLogLevel(4);
  const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

  const playRemote = async (user: any, mediaType: 'audio' | 'video') => {
    await client.subscribe(user, mediaType);
    if (mediaType === 'video' && user.videoTrack) {
      user.videoTrack.play(options.remoteVideoEl, { fit: 'cover' });
    }
    if (mediaType === 'audio' && user.audioTrack) {
      user.audioTrack.play();
    }
  };

  client.on('user-published', playRemote);

  await client.join(
    tokenPayload.appId || env.agora.appId,
    tokenPayload.channel || options.channel,
    tokenPayload.token,
    tokenPayload.uid ?? options.uid ?? 0,
  );

  for (const user of client.remoteUsers) {
    if (user.hasVideo) await playRemote(user, 'video');
    if (user.hasAudio) await playRemote(user, 'audio');
  }

  const [mic, cam] = await createMicAndCam(AgoraRTC, '720p_1', 'user');
  const preset = options.beauty ?? currentPreset;
  const beautyProcessor = await ensureBeautyProcessor(AgoraRTC);
  if (beautyProcessor) {
    await pipeBeauty(cam, beautyProcessor, preset);
  }

  cam.play(options.localVideoEl, { fit: 'cover', mirror: true });
  applyLocalCssBeauty(preset);
  await client.publish([mic, cam]);

  session = { client, mic, cam, beautyProcessor, beautyPreset: preset };
  currentPreset = preset;
  return session;
}

export async function startAgoraSilentMonitor(options: {
  channel: string;
  hostVideoEl: HTMLElement;
  peerVideoEl?: HTMLElement;
  uid?: number;
}) {
  if (Platform.OS !== 'web') {
    throw new Error('Monitor works on web admin panel.');
  }
  await stopAgoraCall();

  const adminUid = options.uid ?? 900000 + Math.floor(Math.random() * 9999);
  const tokenPayload = await fetchRtcToken(options.channel, adminUid, 'subscriber');
  const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
  const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

  let videoSlot = 0;
  client.on('user-published', async (user, mediaType) => {
    await client.subscribe(user, mediaType);
    if (mediaType === 'video' && user.videoTrack) {
      const el =
        videoSlot === 0
          ? options.hostVideoEl
          : options.peerVideoEl || options.hostVideoEl;
      videoSlot += 1;
      user.videoTrack.play(el, { fit: 'cover' });
    }
    if (mediaType === 'audio' && user.audioTrack) {
      user.audioTrack.play();
    }
  });

  await client.join(
    tokenPayload.appId || env.agora.appId,
    options.channel,
    tokenPayload.token,
    adminUid,
  );

  session = { client, mic: null, cam: null, beautyProcessor: null, beautyPreset: 'off' };
  return session;
}

export async function setAgoraMuted(muted: boolean) {
  if (!session?.mic) return;
  await session.mic.setEnabled(!muted);
}

export async function setAgoraCameraOff(off: boolean) {
  if (!session?.cam) return;
  await session.cam.setEnabled(!off);
}

export async function switchAgoraCamera() {
  if (!session?.cam) return;
  const devices = await (await import('agora-rtc-sdk-ng')).default.getCameras();
  if (devices.length < 2) return;
  const current = session.cam.getTrackLabel?.() || '';
  const next = devices.find((d) => d.label !== current) || devices[0];
  if (next?.deviceId) {
    await session.cam.setDevice(next.deviceId);
  }
}

/** Enable/disable Snapchat-style beauty on the live published track */
export async function setAgoraBeauty(
  enabledOrPreset: boolean | BeautyPreset,
) {
  const preset: BeautyPreset =
    typeof enabledOrPreset === 'boolean'
      ? enabledOrPreset
        ? 'snap'
        : 'off'
      : enabledOrPreset;

  currentPreset = preset;
  applyLocalCssBeauty(preset);

  if (!session?.cam) return;
  const processor = session.beautyProcessor;
  if (!processor) {
    // CSS-only fallback already applied
    session.beautyPreset = preset;
    return;
  }

  try {
    if (preset === 'off') {
      await processor.disable();
    } else {
      processor.setOptions(BEAUTY_PRESETS[preset]);
      await processor.enable();
    }
    session.beautyPreset = preset;
  } catch (e) {
    console.warn('setAgoraBeauty failed', e);
  }
}

export async function setAgoraBeautyIntensity(intensity: number) {
  currentDeepARIntensity = Math.max(0, Math.min(1, intensity));
  const preset = session?.beautyPreset ?? currentPreset;
  if (session?.beautyProcessor && preset !== 'off') {
    const opts = { ...BEAUTY_PRESETS[preset] };
    opts.lighteningLevel = Math.min(1, opts.lighteningLevel * (0.55 + currentDeepARIntensity * 0.65));
    opts.smoothnessLevel = Math.min(1, opts.smoothnessLevel * (0.55 + currentDeepARIntensity * 0.65));
    session.beautyProcessor.setOptions(opts);
  }
}

export function getAgoraBeautyPreset(): BeautyPreset {
  return session?.beautyPreset ?? currentPreset;
}

export async function startAgoraLiveBroadcast(options: {
  channel: string;
  localVideoEl?: HTMLElement;
  uid?: number;
  beauty?: BeautyPreset;
}) {
  if (Platform.OS !== 'web') {
    throw new Error('Live broadcast runs on the web host studio. Open coincall-host in Chrome.');
  }
  if (!options.localVideoEl) {
    throw new Error('localVideoEl required for web live broadcast');
  }
  const localVideoEl = options.localVideoEl;
  await stopAgoraCall();
  prepVideoEl(localVideoEl);

  // Use a non-zero uid — Agora + certificate is more reliable than uid 0
  const hostUid =
    options.uid && options.uid > 0
      ? options.uid
      : Math.floor(100000 + Math.random() * 800000);

  // RTC mode (same as 1v1) so Luma viewers can subscribe reliably
  const tokenPayload = await fetchRtcToken(options.channel, hostUid, 'publisher');
  const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
  AgoraRTC.setLogLevel(4);
  const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

  await client.join(
    tokenPayload.appId || env.agora.appId,
    tokenPayload.channel || options.channel,
    tokenPayload.token,
    tokenPayload.uid ?? hostUid,
  );

  const [mic, cam] = await createMicAndCam(AgoraRTC, '720p_2', 'user');
  const preset = options.beauty ?? currentPreset;
  let publishedCam: ICameraVideoTrack = cam;
  let beautyProcessor: any | null = null;

  beautyProcessor = await ensureBeautyProcessor(AgoraRTC);
  if (beautyProcessor) {
    await pipeBeauty(publishedCam, beautyProcessor, preset);
  }
  publishedCam.play(localVideoEl, { fit: 'cover', mirror: true });
  applyLocalCssBeauty(preset);

  await client.publish([mic, publishedCam]);
  session = { client, mic, cam: publishedCam, beautyProcessor, beautyPreset: preset };
  currentPreset = preset;
  return session;
}

export async function startCameraPreview(
  videoEl: HTMLVideoElement,
  facing: 'user' | 'environment' = 'user',
) {
  if (Platform.OS !== 'web') {
    throw new Error('Camera preview is available on web host studio.');
  }
  stopCameraPreview(videoEl);
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: {
      facingMode: facing,
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
  videoEl.srcObject = stream;
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.style.transform =
    facing === 'user' ? 'scaleX(-1)' : 'none';
  await videoEl.play();
  return stream;
}

export function stopCameraPreview(videoEl?: HTMLVideoElement | null) {
  const el = videoEl;
  const stream = el?.srcObject as MediaStream | null | undefined;
  stream?.getTracks().forEach((t) => t.stop());
  if (el) {
    el.srcObject = null;
  }
}

export async function flipPreviewCamera(
  videoEl: HTMLVideoElement,
  currentFacing: 'user' | 'environment',
) {
  const next = currentFacing === 'user' ? 'environment' : 'user';
  await startCameraPreview(videoEl, next);
  return next;
}

export async function stopAgoraCall() {
  if (!session) return;
  const { client, mic, cam, beautyProcessor } = session;
  session = null;
  try {
    if (beautyProcessor) {
      try {
        await beautyProcessor.disable?.();
        cam?.unpipe?.();
      } catch {
        /* ignore */
      }
    }
    if (mic) {
      mic.stop();
      mic.close();
    }
    if (cam) {
      cam.stop();
      cam.close();
    }
    if (mic && cam) {
      await client.unpublish([mic, cam]);
    }
    await client.leave();
  } catch {
    // ignore cleanup errors
  }
}
