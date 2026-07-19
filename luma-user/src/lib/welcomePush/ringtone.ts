/**
 * Classic mobile ringtone for Luma incoming lure / connecting.
 * Dual-tone 440+480 Hz · 2s on · 4s off (phone-like).
 */

let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new AC();
  }
  return ctx;
}

function dualTone(durationSec: number) {
  const audio = getCtx();
  if (!audio) return;
  const now = audio.currentTime;
  const master = audio.createGain();
  master.gain.value = 0.0001;
  master.connect(audio.destination);

  for (const freq of [440, 480]) {
    const osc = audio.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(master);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  master.gain.exponentialRampToValueAtTime(0.2, now + 0.04);
  master.gain.setValueAtTime(0.2, now + durationSec - 0.08);
  master.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
}

function vibrate() {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([400, 200, 400, 200, 400, 2000]);
    }
  } catch {
    /* ignore */
  }
}

function pulse() {
  vibrate();
  dualTone(2.0);
}

export function startWelcomeRingTone() {
  stopWelcomeRingTone();
  const audio = getCtx();
  if (!audio) return;
  void audio.resume();
  pulse();
  timer = setInterval(pulse, 6000);
}

export function stopWelcomeRingTone() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(0);
    }
  } catch {
    /* ignore */
  }
}

/** Alias used by connecting / handshake screens */
export function startRingingTone() {
  startWelcomeRingTone();
}

export function stopRingingTone() {
  stopWelcomeRingTone();
}
