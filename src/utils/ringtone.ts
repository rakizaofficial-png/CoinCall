/**
 * Soft ringtone + vibrate for incoming CoinCall (web + mobile).
 * Never touches web-only APIs without guards — those crash native apps.
 */
import { Platform, Vibration } from 'react-native';

let audioCtx: AudioContext | null = null;
let ringTimer: ReturnType<typeof setInterval> | null = null;
let beepTimer: ReturnType<typeof setTimeout> | null = null;

function ctx() {
  if (Platform.OS !== 'web') return null;
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
}

function tone(frequency: number, durationMs: number, when = 0) {
  const c = ctx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.value = 0.0001;
  osc.connect(gain);
  gain.connect(c.destination);
  const t0 = c.currentTime + when;
  gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.02);
}

function vibrateBurst() {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([180, 80, 180]);
      }
      return;
    }
    Vibration.vibrate([0, 180, 80, 180]);
  } catch {
    /* ignore vibration failures */
  }
}

function ringBurst() {
  tone(880, 180, 0);
  tone(1174, 180, 0.2);
  vibrateBurst();
}

export function startIncomingRingtone() {
  stopIncomingRingtone();
  const c = ctx();
  if (c?.state === 'suspended') {
    void c.resume();
  }
  ringBurst();
  ringTimer = setInterval(ringBurst, 2200);
}

export function stopIncomingRingtone() {
  if (ringTimer) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
  if (beepTimer) {
    clearTimeout(beepTimer);
    beepTimer = null;
  }
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(0);
      }
    } else {
      Vibration.cancel();
    }
  } catch {
    /* ignore */
  }
}
