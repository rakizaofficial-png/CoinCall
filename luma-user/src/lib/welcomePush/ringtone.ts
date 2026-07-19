/**
 * Louder smartphone-style ring + vibrate for Welcome Push incoming lure.
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

function tone(durationMs: number, freq: number, volume: number) {
  const audio = getCtx();
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(audio.destination);
  const now = audio.currentTime;
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.02);
}

function vibratePulse() {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([220, 100, 220, 100, 400]);
    }
  } catch {
    /* ignore */
  }
}

/** Aggressive ring pattern — incoming smartphone feel */
export function startWelcomeRingTone() {
  stopWelcomeRingTone();
  const audio = getCtx();
  if (!audio) return;
  void audio.resume();

  const pulse = () => {
    vibratePulse();
    tone(280, 520, 0.09);
    window.setTimeout(() => tone(280, 620, 0.08), 300);
    window.setTimeout(() => tone(180, 480, 0.07), 650);
  };
  pulse();
  timer = setInterval(pulse, 1800);
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
