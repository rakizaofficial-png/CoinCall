/**
 * Soft ringing tone for fake handshake (Web Audio — no asset file required).
 * Mimics a real PSTN / VoIP ringback while “Connecting to Host…”.
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

function beep(durationMs: number, freq: number, gainValue: number) {
  const audio = getCtx();
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.value = gainValue;
  osc.connect(gain);
  gain.connect(audio.destination);
  const now = audio.currentTime;
  gain.gain.setValueAtTime(gainValue, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.02);
}

/** Dual-tone ring pattern every ~2s */
export function startRingingTone() {
  stopRingingTone();
  const audio = getCtx();
  if (!audio) return;
  void audio.resume();

  const pulse = () => {
    beep(380, 440, 0.045);
    window.setTimeout(() => beep(380, 480, 0.04), 420);
  };
  pulse();
  timer = setInterval(pulse, 2000);
}

export function stopRingingTone() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
