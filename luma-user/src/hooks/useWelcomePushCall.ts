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

function hasSeenWelcomePush(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(WELCOME_PUSH_CONFIG.storageKey) === "1";
  } catch {
    return false;
  }
}

function markWelcomePushSeen() {
  try {
    localStorage.setItem(WELCOME_PUSH_CONFIG.storageKey, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Lifecycle engine:
 * IDLE → (3s after first home load) → INCOMING_CALL
 *      → Accept → TEASER_PLAYING (3.5s hard cut) → PAYWALL_BOOST → DONE
 */
export function useWelcomePushCall(opts: { enabled: boolean }) {
  const [phase, setPhase] = useState<WelcomePushPhase>("IDLE");
  const [offerLeft, setOfferLeft] = useState<number>(
    WELCOME_PUSH_CONFIG.offerSeconds,
  );
  const launched = useRef(false);
  const teaserTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offerTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (teaserTimer.current) {
      clearTimeout(teaserTimer.current);
      teaserTimer.current = null;
    }
    if (offerTimer.current) {
      clearInterval(offerTimer.current);
      offerTimer.current = null;
    }
    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    stopWelcomeRingTone();
  }, []);

  // Auto-trigger exactly 3s after home dashboard is ready (first session only)
  useEffect(() => {
    if (!opts.enabled) return;
    if (launched.current) return;
    if (hasSeenWelcomePush()) return;
    launched.current = true;

    settleTimer.current = setTimeout(() => {
      setPhase("INCOMING_CALL");
      startWelcomeRingTone();
    }, WELCOME_PUSH_CONFIG.launchDelayMs);

    return () => {
      if (settleTimer.current) {
        clearTimeout(settleTimer.current);
        settleTimer.current = null;
      }
    };
  }, [opts.enabled]);

  // Keep ringing while incoming is visible
  useEffect(() => {
    if (phase === "INCOMING_CALL") {
      startWelcomeRingTone();
      return () => stopWelcomeRingTone();
    }
    stopWelcomeRingTone();
  }, [phase]);

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
    markWelcomePushSeen();
    setPhase("DONE");
  }, []);

  const acceptIncoming = useCallback(() => {
    stopWelcomeRingTone();
    setPhase("TEASER_PLAYING");
    teaserTimer.current = setTimeout(() => {
      setPhase("PAYWALL_BOOST");
      markWelcomePushSeen();
    }, WELCOME_PUSH_CONFIG.teaserCutMs);
  }, []);

  const closePaywall = useCallback(() => {
    clearTimers();
    markWelcomePushSeen();
    setPhase("DONE");
  }, [clearTimers]);

  const hardDisconnectTeaser = useCallback(() => {
    if (teaserTimer.current) clearTimeout(teaserTimer.current);
    setPhase("PAYWALL_BOOST");
    markWelcomePushSeen();
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
