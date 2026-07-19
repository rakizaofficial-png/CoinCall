'use client';

/**
 * =============================================================================
 * AGORA WEB RTC (User App)
 * =============================================================================
 * SETUP:
 * 1. https://console.agora.io → Create project → copy App ID
 * 2. Enable Primary Certificate → put certificate on CoinCall SERVER only
 *    (AGORA_APP_CERTIFICATE). Never ship certificate in Next.js.
 * 3. NEXT_PUBLIC_AGORA_APP_ID in Luma `.env.local`
 * 4. Join ONLY with tokens from POST/GET `/api/calls/:id/token`
 * =============================================================================
 */

type LiveSession = {
  client: import('agora-rtc-sdk-ng').IAgoraRTCClient;
  mic: import('agora-rtc-sdk-ng').IMicrophoneAudioTrack | null;
  cam: import('agora-rtc-sdk-ng').ICameraVideoTrack | null;
};

let session: LiveSession | null = null;

function prep(el: HTMLElement) {
  el.style.width = '100%';
  el.style.height = '100%';
  el.style.minHeight = '120px';
  el.style.background = '#000';
  el.style.overflow = 'hidden';
  el.replaceChildren();
}

export async function startUserAgoraCall(options: {
  appId: string;
  channel: string;
  token: string;
  uid: number;
  localVideoEl: HTMLElement;
  remoteVideoEl: HTMLElement;
}) {
  await stopUserAgoraCall();
  prep(options.localVideoEl);
  prep(options.remoteVideoEl);

  const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
  AgoraRTC.setLogLevel(4);
  const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

  const playRemote = async (
    user: import('agora-rtc-sdk-ng').IAgoraRTCRemoteUser,
    mediaType: 'audio' | 'video',
  ) => {
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
    options.appId,
    options.channel,
    options.token,
    options.uid,
  );

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

/** Watch a host live broadcast (audience — no cam/mic publish) */
export async function startUserAgoraLiveAudience(options: {
  appId: string;
  channel: string;
  token: string;
  uid: number;
  remoteVideoEl: HTMLElement;
}) {
  await stopUserAgoraCall();
  prep(options.remoteVideoEl);

  const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
  AgoraRTC.setLogLevel(4);
  const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
  await client.setClientRole('audience');

  const playRemote = async (
    user: import('agora-rtc-sdk-ng').IAgoraRTCRemoteUser,
    mediaType: 'audio' | 'video',
  ) => {
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
    options.appId,
    options.channel,
    options.token,
    options.uid,
  );

  for (const user of client.remoteUsers) {
    if (user.hasVideo) await playRemote(user, 'video');
    if (user.hasAudio) await playRemote(user, 'audio');
  }

  session = { client, mic: null, cam: null };
  return session;
}

export async function setUserMuted(muted: boolean) {
  if (!session?.mic) return;
  await session.mic.setEnabled(!muted);
}

export async function setUserCameraOff(off: boolean) {
  if (!session?.cam) return;
  await session.cam.setEnabled(!off);
}

export async function stopUserAgoraCall() {
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
    // ignore
  }
}
