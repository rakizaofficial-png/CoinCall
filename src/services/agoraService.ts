import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { Platform } from 'react-native';
import { env } from '../config/env';

export function isAgoraConfigured() {
  // App ID comes from token API — only need API base
  return Boolean(env.apiBaseUrl);
}

type LiveSession = {
  client: IAgoraRTCClient;
  mic: IMicrophoneAudioTrack | null;
  cam: ICameraVideoTrack | null;
};

let session: LiveSession | null = null;

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
}) {
  if (Platform.OS !== 'web') {
    throw new Error('Phone video needs a Dev Build. Use web for live calls.');
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

  // Catch peers who published before our listener
  for (const user of client.remoteUsers) {
    if (user.hasVideo) await playRemote(user, 'video');
    if (user.hasAudio) await playRemote(user, 'audio');
  }

  const [mic, cam] = await AgoraRTC.createMicrophoneAndCameraTracks(
    {},
    { encoderConfig: '480p_1' },
  );
  cam.play(options.localVideoEl, { fit: 'cover' });
  await client.publish([mic, cam]);

  session = { client, mic, cam };
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

  session = { client, mic: null, cam: null };
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
  // Agora web camera track supports setDevice / facing mode via recreate
  const devices = await (await import('agora-rtc-sdk-ng')).default.getCameras();
  if (devices.length < 2) return;
  const current = session.cam.getTrackLabel?.() || '';
  const next = devices.find((d) => d.label !== current) || devices[0];
  if (next?.deviceId) {
    await session.cam.setDevice(next.deviceId);
  }
}

export async function setAgoraBeauty(enabled: boolean) {
  if (!session?.cam) return;
  const el = document.getElementById('agora-local') || document.getElementById('live-local');
  if (el && 'style' in el) {
    (el as HTMLElement).style.filter = enabled
      ? 'brightness(1.1) contrast(1.06) saturate(1.2) blur(0.35px)'
      : 'none';
  }
}

/**
 * Start a LIVE broadcast (host publishes camera+mic into live_{id} channel).
 */
export async function startAgoraLiveBroadcast(options: {
  channel: string;
  localVideoEl: HTMLElement;
  uid?: number;
}) {
  if (Platform.OS !== 'web') {
    throw new Error('Live broadcast runs on the web host studio. Open coincall-host in Chrome.');
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

  const [mic, cam] = await AgoraRTC.createMicrophoneAndCameraTracks(
    {},
    { encoderConfig: '720p_2', facingMode: 'user' },
  );
  cam.play(options.localVideoEl, { fit: 'cover' });
  await client.publish([mic, cam]);
  session = { client, mic, cam };
  return session;
}

/**
 * Camera-only preview before going live (getUserMedia, no channel yet).
 */
export async function startCameraPreview(videoEl: HTMLVideoElement, facing: 'user' | 'environment' = 'user') {
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
  const { client, mic, cam } = session;
  session = null;
  try {
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
