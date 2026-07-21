import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { Platform } from 'react-native';
import { env } from '../config/env';

export function isAgoraConfigured() {
  return Boolean(env.apiBaseUrl);
}

/** Snapchat-style beauty presets — applied to the published video track */
export type BeautyPreset = 'off' | 'natural' | 'glamour' | 'snap';

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
  // Soft daily look
  natural: {
    lighteningContrastLevel: 1,
    lighteningLevel: 0.55,
    smoothnessLevel: 0.55,
    sharpnessLevel: 0.35,
    rednessLevel: 0.12,
  },
  // Full glam — soft skin, bright, rosy
  glamour: {
    lighteningContrastLevel: 1,
    lighteningLevel: 0.78,
    smoothnessLevel: 0.88,
    sharpnessLevel: 0.42,
    rednessLevel: 0.28,
  },
  // Snapchat / live-app “world beauty”
  snap: {
    lighteningContrastLevel: 2,
    lighteningLevel: 0.82,
    smoothnessLevel: 0.92,
    sharpnessLevel: 0.48,
    rednessLevel: 0.32,
  },
};

/** CSS for local PiP preview (little host window) */
export function beautyCssFilter(preset: BeautyPreset): string {
  if (preset === 'off') return 'none';
  if (preset === 'natural') {
    return 'brightness(1.08) contrast(1.04) saturate(1.12) blur(0.25px)';
  }
  if (preset === 'glamour') {
    return 'brightness(1.14) contrast(1.06) saturate(1.22) blur(0.4px)';
  }
  // snap — strongest soft-glow
  return 'brightness(1.18) contrast(1.08) saturate(1.28) blur(0.55px)';
}

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

function apiRoot() {
  const raw = (env.apiBaseUrl || 'https://coincall-api.onrender.com/api').replace(
    /\/$/,
    '',
  );
  if (
    typeof window !== 'undefined' &&
    window.location.hostname.includes('onrender.com') &&
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
  const el =
    document.getElementById('agora-local') || document.getElementById('live-local');
  if (!el || !('style' in el)) return;
  const node = el as HTMLElement;
  node.style.filter = beautyCssFilter(preset);
  // Slight “little face” slim on self-view (Snapchat feel)
  node.style.transform =
    preset === 'off' ? 'scaleX(-1)' : 'scaleX(-1) scale(0.96)';
  node.style.transformOrigin = 'center center';
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
  localVideoEl: HTMLElement;
  remoteVideoEl: HTMLElement;
  uid?: number;
  token?: string;
  appId?: string;
  beauty?: BeautyPreset;
}) {
  if (Platform.OS !== 'web') {
    // Native video needs react-native Agora wiring — do not throw (crashes call UI).
    console.warn('[agora] Video calls are web-only in this build.');
    return;
  }
  if (!apiRoot()) {
    throw new Error('Missing API base URL for Agora token');
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
    console.warn('[agora] Monitor is web-only.');
    return;
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

export function getAgoraBeautyPreset(): BeautyPreset {
  return session?.beautyPreset ?? currentPreset;
}

export async function startAgoraLiveBroadcast(options: {
  channel: string;
  localVideoEl: HTMLElement;
  uid?: number;
  beauty?: BeautyPreset;
}) {
  if (Platform.OS !== 'web') {
    console.warn('[agora] Live broadcast is web-only in this build.');
    return null;
  }
  await stopAgoraCall();
  prepVideoEl(options.localVideoEl);

  const tokenPayload = await fetchRtcToken(options.channel, options.uid ?? 0, 'publisher');
  const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
  AgoraRTC.setLogLevel(4);
  const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
  await client.setClientRole('host');

  await client.join(
    tokenPayload.appId || env.agora.appId,
    tokenPayload.channel || options.channel,
    tokenPayload.token,
    tokenPayload.uid ?? options.uid ?? 0,
  );

  const [mic, cam] = await createMicAndCam(AgoraRTC, '720p_2', 'user');
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

export async function startCameraPreview(
  videoEl: HTMLVideoElement,
  facing: 'user' | 'environment' = 'user',
) {
  if (Platform.OS !== 'web') {
    console.warn('[agora] Camera preview is web-only.');
    return;
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
  videoEl.style.filter = beautyCssFilter(currentPreset);
  videoEl.style.transform =
    facing === 'user' ? 'scaleX(-1) scale(0.96)' : 'none';
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
