/**
 * Classic mobile ringtone (North-American dual-tone style).
 * Pattern: ~2s ring (440 Hz + 480 Hz) → ~4s silence → repeat.
 */
let audioCtx: AudioContext | null = null;
let ringTimer: ReturnType<typeof setInterval> | null = null;
let stopBurstTimers: Array<ReturnType<typeof setTimeout>> = [];

function ctx() {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
}

function dualTone(durationSec: number) {
  const c = ctx();
  if (!c) return;
  const now = c.currentTime;
  const master = c.createGain();
  master.gain.value = 0.0001;
  master.connect(c.destination);

  for (const freq of [440, 480]) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(master);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  master.gain.exponentialRampToValueAtTime(0.22, now + 0.04);
  master.gain.setValueAtTime(0.22, now + durationSec - 0.08);
  master.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
}

function vibrateClassic() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    // Match ring / pause feel
    navigator.vibrate([400, 200, 400, 200, 400, 2000]);
  }
}

function ringBurst() {
  dualTone(2.0);
  vibrateClassic();
}

export function startIncomingRingtone() {
  stopIncomingRingtone();
  const c = ctx();
  if (c?.state === 'suspended') {
    void c.resume();
  }
  ringBurst();
  // Classic cadence: ring 2s, gap ~4s → interval 6s
  ringTimer = setInterval(ringBurst, 6000);
}

export function stopIncomingRingtone() {
  if (ringTimer) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
  for (const t of stopBurstTimers) clearTimeout(t);
  stopBurstTimers = [];
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(0);
  }
}
