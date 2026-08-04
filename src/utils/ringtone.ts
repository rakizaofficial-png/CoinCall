import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Platform, Vibration } from 'react-native';
import { stopAllGiftSounds } from '../services/giftSoundService';

const ringtoneAsset = require('../../assets/audio/incoming-call-ringtone.mp3');

let sound: AudioPlayer | null = null;
let vibrationTimer: ReturnType<typeof setInterval> | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let lifecycleId = 0;
let activeCallKey: string | null = null;

async function configureRingAudioSession() {
  if (Platform.OS === 'web') return;
  await setAudioModeAsync({
    // Keep the recording category alive when a call rings over an active live.
    // Switching this off tears down the broadcaster microphone session.
    allowsRecording: true,
    shouldPlayInBackground: true,
    playsInSilentMode: true,
    shouldRouteThroughEarpiece: false,
    interruptionMode: 'doNotMix',
  });
}

async function configureCallAudioSession() {
  if (Platform.OS === 'web') return;
  await setAudioModeAsync({
    allowsRecording: true,
    shouldPlayInBackground: true,
    playsInSilentMode: true,
    shouldRouteThroughEarpiece: false,
    interruptionMode: 'doNotMix',
  });
}

function startSubtleVibration() {
  stopVibration();
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    nav?.vibrate?.([280, 420, 280, 1600]);
    vibrationTimer = setInterval(() => nav?.vibrate?.([280, 420, 280, 1600]), 2600);
    return;
  }
  Vibration.vibrate([0, 280, 420, 280, 1600], true);
}

function stopVibration() {
  if (vibrationTimer) {
    clearInterval(vibrationTimer);
    vibrationTimer = null;
  }
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined') navigator.vibrate?.(0);
    return;
  }
  Vibration.cancel();
}

export async function startIncomingRingtone(
  timeoutMs = 30_000,
  callKey?: string,
) {
  const nextKey = callKey || `ring_${Date.now()}`;
  if (activeCallKey === nextKey && stopTimer) return;
  const requestId = ++lifecycleId;
  activeCallKey = nextKey;
  try {
    await releaseCurrentRingtone();
    if (requestId !== lifecycleId) return;
    activeCallKey = nextKey;
    stopTimer = setTimeout(() => {
      void stopIncomingRingtone();
    }, timeoutMs);
    await stopAllGiftSounds();
    await configureRingAudioSession();
    if (requestId !== lifecycleId) return;
    const created = createAudioPlayer(ringtoneAsset);
    created.loop = true;
    created.volume = 0.72;
    created.play();
    if (requestId !== lifecycleId) {
      created.pause();
      created.release();
      return;
    }
    sound = created;
    startSubtleVibration();
  } catch (e) {
    if (requestId === lifecycleId) {
      console.warn('[ringtone] start failed', e);
      startSubtleVibration();
    }
  }
}

async function releaseCurrentRingtone() {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  stopVibration();
  const current = sound;
  sound = null;
  if (!current) return;
  try {
    current.pause();
  } catch {
    /* already stopped */
  }
  try {
    current.release();
  } catch {
    /* already unloaded */
  }
}

export async function stopIncomingRingtone() {
  // Invalidates an Audio.Sound load already in progress. Without this token,
  // createAsync could finish after Accept and start ringing inside the call.
  lifecycleId += 1;
  activeCallKey = null;
  await releaseCurrentRingtone();
}

export async function prepareAudioForAgoraCall() {
  await stopIncomingRingtone();
  await stopAllGiftSounds();
  await configureCallAudioSession();
}

export function cancelIncomingVibration() {
  stopVibration();
}
