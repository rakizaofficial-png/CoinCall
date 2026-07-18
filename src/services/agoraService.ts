import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { Platform } from 'react-native';
import { env } from '../config/env';

export function isAgoraConfigured() {
  return Boolean(env.agora.appId && env.apiBaseUrl);
}

type LiveSession = {
  client: IAgoraRTCClient;
  mic: IMicrophoneAudioTrack | null;
  cam: ICameraVideoTrack | null;
};

let session: LiveSession | null = null;

async function fetchRtcToken(
  channel: string,
  uid = 0,
  role: 'publisher' | 'subscriber' = 'publisher',
) {
  const url = `${env.apiBaseUrl.replace(/\/$/, '')}/agora/token?channel=${encodeURIComponent(channel)}&uid=${uid}&role=${role}`;
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

/**
 * Web-only Agora join. Uses backend token (certificate stays on server).
 */
export async function startAgoraCall(options: {
  channel: string;
  localVideoEl: HTMLElement;
  remoteVideoEl: HTMLElement;
  uid?: number;
}) {
  if (Platform.OS !== 'web') {
    throw new Error('Phone video needs a Dev Build. Use web preview for now.');
  }
  if (!env.agora.appId) {
    throw new Error('Missing EXPO_PUBLIC_AGORA_APP_ID in .env');
  }
  if (!env.apiBaseUrl) {
    throw new Error('Missing EXPO_PUBLIC_API_BASE_URL for Agora token');
  }

  await stopAgoraCall();

  const tokenPayload = await fetchRtcToken(options.channel, options.uid ?? 0, 'publisher');
  const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
  const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

  client.on('user-published', async (user, mediaType) => {
    await client.subscribe(user, mediaType);
    if (mediaType === 'video' && user.videoTrack) {
      user.videoTrack.play(options.remoteVideoEl);
    }
    if (mediaType === 'audio' && user.audioTrack) {
      user.audioTrack.play();
    }
  });

  await client.join(
    tokenPayload.appId || env.agora.appId,
    options.channel,
    tokenPayload.token,
    tokenPayload.uid ?? options.uid ?? 0,
  );

  const [mic, cam] = await AgoraRTC.createMicrophoneAndCameraTracks();
  cam.play(options.localVideoEl);
  await client.publish([mic, cam]);

  session = { client, mic, cam };
  return session;
}

/**
 * Silent admin monitor — subscribe only, never publish.
 * Host does not see admin in the call (no camera/mic published).
 */
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
      user.videoTrack.play(el);
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

  // No publish — invisible behind the host
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
