/**
 * Native Agora (iOS / Android) via react-native-agora.
 * Bundled only on device builds (Expo Dev Client / EAS), not web.
 */
import {
  ChannelProfileType,
  ClientRoleType,
  createAgoraRtcEngine,
  type IRtcEngine,
  type IRtcEngineEventHandler,
  RenderModeType,
} from 'react-native-agora';
import { env } from '../config/env';
import {
  BEAUTY_PRESETS,
  type BeautyPreset,
  type StartAgoraCallOptions,
} from './agoraTypes';

export type { BeautyPreset } from './agoraTypes';
export {
  BEAUTY_PRESETS,
  type StartAgoraCallOptions,
} from './agoraTypes';

let engine: IRtcEngine | null = null;
let joined = false;
let localUid = 0;
let remoteUid: number | null = null;
let currentPreset: BeautyPreset = 'snap';
let joinWaiter: {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
} | null = null;
const remoteListeners = new Set<(uid: number | null) => void>();

function settleJoin(error?: Error) {
  if (!joinWaiter) return;
  const pending = joinWaiter;
  joinWaiter = null;
  clearTimeout(pending.timeout);
  if (error) pending.reject(error);
  else pending.resolve();
}

function apiRoot() {
  return (env.apiBaseUrl || 'https://coincall-api.onrender.com/api').replace(
    /\/$/,
    '',
  );
}

export function isAgoraConfigured() {
  return Boolean(apiRoot());
}

export function getNativeLocalUid() {
  return localUid;
}

export function getNativeRemoteUid() {
  return remoteUid;
}

export function subscribeNativeRemoteUid(
  listener: (uid: number | null) => void,
) {
  remoteListeners.add(listener);
  listener(remoteUid);
  return () => {
    remoteListeners.delete(listener);
  };
}

function setRemoteUid(uid: number | null) {
  remoteUid = uid;
  remoteListeners.forEach((fn) => {
    try {
      fn(uid);
    } catch {
      /* ignore */
    }
  });
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

function ensureEngine(appId: string): IRtcEngine {
  if (engine) return engine;
  const rtc = createAgoraRtcEngine();
  rtc.initialize({
    appId,
    channelProfile: ChannelProfileType.ChannelProfileCommunication,
  });

  const handler: IRtcEngineEventHandler = {
    onJoinChannelSuccess: (_connection, uid) => {
      localUid = uid;
      joined = true;
      settleJoin();
    },
    onUserJoined: (_connection, uid) => {
      setRemoteUid(uid);
    },
    onUserOffline: (_connection, uid) => {
      if (remoteUid === uid) setRemoteUid(null);
    },
    onError: (err, msg) => {
      console.warn('[agora-native] error', err, msg);
      settleJoin(new Error(`Agora error ${err}${msg ? `: ${msg}` : ''}`));
    },
  };
  rtc.registerEventHandler(handler);
  rtc.enableVideo();
  rtc.enableAudio();
  rtc.setClientRole(ClientRoleType.ClientRoleBroadcaster);
  engine = rtc;
  return rtc;
}

export async function startAgoraCall(options: StartAgoraCallOptions) {
  if (!apiRoot()) {
    throw new Error('Missing API base URL for Agora token');
  }

  // Fetch token in parallel with engine warm-up to cut black-screen delay
  const tokenPromise =
    options.token && options.appId
      ? Promise.resolve({
          token: options.token,
          appId: options.appId,
          uid: options.uid ?? 0,
          channel: options.channel,
        })
      : fetchRtcToken(options.channel, options.uid ?? 0, 'publisher');

  // Keep existing engine if already warm — avoid destroy/recreate flash
  const appIdHint = options.appId || env.agora.appId;
  if (engine && joined) {
    await stopAgoraCall();
  }

  const tokenPayload = await tokenPromise;
  const appId = tokenPayload.appId || appIdHint;
  if (!appId) {
    throw new Error('Missing Agora App ID');
  }

  const rtc = ensureEngine(appId);
  const preset = options.beauty ?? currentPreset;
  currentPreset = preset;

  const uid =
    tokenPayload.uid && tokenPayload.uid > 0
      ? tokenPayload.uid
      : Math.floor(100000 + Math.random() * 800000);
  localUid = uid;

  // Preview first so surface paints immediately (no black frame)
  rtc.enableLocalVideo(true);
  rtc.startPreview();

  // Register the waiter before invoking the native method. On fast Android
  // devices onJoinChannelSuccess can arrive before joinChannel returns.
  const joinedPromise = new Promise<void>((resolve, reject) => {
    joinWaiter = {
      resolve,
      reject,
      timeout: setTimeout(
        () => settleJoin(new Error('Agora join timed out. Check network and token.')),
        15_000,
      ),
    };
  });
  const result = rtc.joinChannel(
    tokenPayload.token,
    tokenPayload.channel || options.channel,
    uid,
    {
      clientRoleType: ClientRoleType.ClientRoleBroadcaster,
      publishMicrophoneTrack: true,
      publishCameraTrack: true,
      autoSubscribeAudio: true,
      autoSubscribeVideo: true,
    },
  );

  if (result < 0) {
    settleJoin(new Error(`joinChannel failed (${result})`));
  }
  await joinedPromise;
  return { localUid: uid, remoteUid };
}

/** Live broadcast on native uses the same RTC path as 1:1 */
export async function startAgoraLiveBroadcast(options: {
  channel: string;
  localVideoEl?: HTMLElement;
  uid?: number;
  beauty?: BeautyPreset;
}) {
  return startAgoraCall({
    channel: options.channel,
    uid: options.uid,
    beauty: options.beauty,
  });
}

export async function startAgoraSilentMonitor(_options: {
  channel: string;
  hostVideoEl?: HTMLElement;
  peerVideoEl?: HTMLElement;
  uid?: number;
}) {
  throw new Error('Silent monitor is admin/web only.');
}

export async function setAgoraMuted(muted: boolean) {
  engine?.muteLocalAudioStream(muted);
}

export async function setAgoraCameraOff(off: boolean) {
  engine?.muteLocalVideoStream(off);
  engine?.enableLocalVideo(!off);
}

export async function switchAgoraCamera() {
  try {
    engine?.switchCamera();
  } catch {
    /* ignore */
  }
}

export async function setAgoraBeauty(enabledOrPreset: boolean | BeautyPreset) {
  const preset: BeautyPreset =
    typeof enabledOrPreset === 'boolean'
      ? enabledOrPreset
        ? 'snap'
        : 'off'
      : enabledOrPreset;
  currentPreset = preset;
  // Native beauty is intentionally disabled until a single-pipeline Agora
  // video-frame processor is available. A second camera owner alongside Agora
  // crashes some Android devices.
}

export async function setAgoraBeautyIntensity(_intensity: number) {
  // See setAgoraBeauty: no-op keeps call/live camera ownership stable.
}

export function getAgoraBeautyPreset(): BeautyPreset {
  return currentPreset;
}

export async function startCameraPreview() {
  if (!engine && env.agora.appId) {
    ensureEngine(env.agora.appId);
  }
  engine?.enableLocalVideo(true);
  engine?.startPreview();
}

export function stopCameraPreview() {
  try {
    engine?.stopPreview();
  } catch {
    /* ignore */
  }
}

export async function flipPreviewCamera() {
  await switchAgoraCamera();
  return 'user' as const;
}

export async function stopAgoraCall() {
  settleJoin(new Error('Agora call stopped before joining'));
  if (!engine) {
    joined = false;
    setRemoteUid(null);
    return;
  }
  try {
    if (joined) {
      engine.leaveChannel();
    }
    engine.stopPreview();
    engine.release();
  } catch {
    /* ignore cleanup */
  }
  engine = null;
  joined = false;
  localUid = 0;
  setRemoteUid(null);
}

/** Re-export render helpers for CallScreen */
export {
  RenderModeType,
  RtcSurfaceView,
  VideoMirrorModeType,
  VideoSourceType,
} from 'react-native-agora';
