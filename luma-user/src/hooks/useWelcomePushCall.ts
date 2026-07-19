"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  WELCOME_PUSH_CONFIG,
  WELCOME_PUSH_HOST,
  type WelcomePushPhase,
} from "@/lib/welcomePush/config";
import {
  startWelcomeRingTone,
  stopWelcomeRingTone,
} from "@/lib/welcomePush/ringtone";

/**
 * Lifecycle:
 * IDLE → INCOMING_CALL (mobile ringtone, max 30s)
 *      → Accept → TEASER → PAYWALL → DONE (then schedule next in 3 min)
 *      → Reject / timeout 30s → IDLE (schedule next in 3 min)
 *
 * Repeats every 3 minutes while user is on home.
 */
export function useWelcomePushCall(opts: { enabled: boolean }) {
  const [phase, setPhase] = useState<WelcomePushPhase>("IDLE");
  const [offerLeft, setOfferLeft] = useState<number>(
    WELCOME_PUSH_CONFIG.offerSeconds,
  );
  const teaserTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offerTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<WelcomePushPhase>("IDLE");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const clearTimers = useCallback(() => {
    if (teaserTimer.current) {
      clearTimeout(teaserTimer.current);
      teaserTimer.current = null;
    }
    if (offerTimer.current) {
      clearInterval(offerTimer.current);
      offerTimer.current = null;
    }
    if (ringTimer.current) {
      clearTimeout(ringTimer.current);
      ringTimer.current = null;
    }
    stopWelcomeRingTone();
  }, []);

  const scheduleNext = useCallback(
    (delayMs: number) => {
      if (repeatTimer.current) clearTimeout(repeatTimer.current);
      repeatTimer.current = setTimeout(() => {
        if (!opts.enabled) return;
        if (phaseRef.current !== "IDLE" && phaseRef.current !== "DONE") return;
        setPhase("INCOMING_CALL");
        startWelcomeRingTone();
      }, delayMs);
    },
    [opts.enabled],
  );

  // First call + recurring every 3 minutes while on home
  useEffect(() => {
    if (!opts.enabled) {
      clearTimers();
      if (repeatTimer.current) clearTimeout(repeatTimer.current);
      setPhase("IDLE");
      return;
    }
    scheduleNext(WELCOME_PUSH_CONFIG.launchDelayMs);
    return () => {
      clearTimers();
      if (repeatTimer.current) clearTimeout(repeatTimer.current);
    };
  }, [opts.enabled, clearTimers, scheduleNext]);

  // Ringtone + auto-dismiss after 30s
  useEffect(() => {
    if (phase !== "INCOMING_CALL") {
      stopWelcomeRingTone();
      if (ringTimer.current) {
        clearTimeout(ringTimer.current);
        ringTimer.current = null;
      }
      return;
    }
    startWelcomeRingTone();
    ringTimer.current = setTimeout(() => {
      stopWelcomeRingTone();
      setPhase("IDLE");
      scheduleNext(WELCOME_PUSH_CONFIG.repeatEveryMs);
    }, WELCOME_PUSH_CONFIG.ringDurationMs);
    return () => {
      stopWelcomeRingTone();
      if (ringTimer.current) {
        clearTimeout(ringTimer.current);
        ringTimer.current = null;
      }
    };
  }, [phase, scheduleNext]);

  // Paywall FOMO countdown
  useEffect(() => {
    if (phase !== "PAYWALL_BOOST") return;
    setOfferLeft(WELCOME_PUSH_CONFIG.offerSeconds);
    offerTimer.current = setInterval(() => {
      setOfferLeft((s) => {
        if (s <= 1) {
          if (offerTimer.current) clearInterval(offerTimer.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (offerTimer.current) clearInterval(offerTimer.current);
    };
  }, [phase]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const rejectIncoming = useCallback(() => {
    stopWelcomeRingTone();
    setPhase("IDLE");
    scheduleNext(WELCOME_PUSH_CONFIG.repeatEveryMs);
  }, [scheduleNext]);

  const acceptIncoming = useCallback(() => {
    stopWelcomeRingTone();
    if (ringTimer.current) {
      clearTimeout(ringTimer.current);
      ringTimer.current = null;
    }
    setPhase("TEASER_PLAYING");
    teaserTimer.current = setTimeout(() => {
      setPhase("PAYWALL_BOOST");
    }, WELCOME_PUSH_CONFIG.teaserCutMs);
  }, []);

  const closePaywall = useCallback(() => {
    clearTimers();
    setPhase("IDLE");
    scheduleNext(WELCOME_PUSH_CONFIG.repeatEveryMs);
  }, [clearTimers, scheduleNext]);

  const hardDisconnectTeaser = useCallback(() => {
    if (teaserTimer.current) clearTimeout(teaserTimer.current);
    setPhase("PAYWALL_BOOST");
  }, []);

  return {
    phase,
    host: WELCOME_PUSH_HOST,
    offerLeft,
    acceptIncoming,
    rejectIncoming,
    closePaywall,
    hardDisconnectTeaser,
  };
}
