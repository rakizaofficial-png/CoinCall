/**
 * Classic mobile ringtone for Luma incoming lure / connecting.
 * Dual-tone 440+480 Hz · 2s on · 4s off (phone-like).
 */

let timer: ReturnType<typeof setInterval> | null = null;
let audioEl: HTMLAudioElement | null = null;

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
}

export function startWelcomeRingTone() {
  stopWelcomeRingTone();
  if (typeof window !== "undefined") {
    audioEl = new Audio("/audio/incoming-call-ringtone.mp3");
    audioEl.loop = true;
    audioEl.volume = 0.72;
    audioEl.preload = "auto";
    void audioEl.play().catch(() => {
      /* Browser may require a user gesture; vibration still runs. */
    });
  }
  pulse();
  timer = setInterval(pulse, 2600);
}

export function stopWelcomeRingTone() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  try {
    if (audioEl) {
      audioEl.pause();
      audioEl.currentTime = 0;
      audioEl.src = "";
      audioEl.load();
      audioEl = null;
    }
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
