import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { Platform, Vibration } from 'react-native';

const ringtoneAsset = require('../../assets/audio/incoming-call-ringtone.mp3');

let sound: Audio.Sound | null = null;
let vibrationTimer: ReturnType<typeof setInterval> | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let starting = false;

async function configureRingAudioSession() {
  if (Platform.OS === 'web') return;
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    staysActiveInBackground: true,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: false,
    playThroughEarpieceAndroid: false,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
  });
}

async function configureCallAudioSession() {
  if (Platform.OS === 'web') return;
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    staysActiveInBackground: true,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: false,
    playThroughEarpieceAndroid: false,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
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

export async function startIncomingRingtone(timeoutMs = 30_000) {
  if (starting || sound) {
    startSubtleVibration();
    return;
  }
  starting = true;
  try {
    await stopIncomingRingtone();
    await configureRingAudioSession();
    const created = await Audio.Sound.createAsync(
      ringtoneAsset,
      {
        isLooping: true,
        shouldPlay: true,
        volume: 0.72,
        progressUpdateIntervalMillis: 500,
      },
      undefined,
      true,
    );
    sound = created.sound;
    startSubtleVibration();
    stopTimer = setTimeout(() => {
      void stopIncomingRingtone();
    }, timeoutMs);
  } catch (e) {
    console.warn('[ringtone] start failed', e);
    startSubtleVibration();
  } finally {
    starting = false;
  }
}

export async function stopIncomingRingtone() {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  stopVibration();
  const current = sound;
  sound = null;
  if (!current) return;
  try {
    await current.stopAsync();
  } catch {
    /* already stopped */
  }
  try {
    await current.unloadAsync();
  } catch {
    /* already unloaded */
  }
}

export async function prepareAudioForAgoraCall() {
  await stopIncomingRingtone();
  await configureCallAudioSession();
}

export function cancelIncomingVibration() {
  stopVibration();
}
