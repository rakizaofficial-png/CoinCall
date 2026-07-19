"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { DiamondEntranceBlast } from "@/components/DiamondEntranceBlast";
import { TopUpSheet } from "@/components/TopUpSheet";
import { useApp } from "@/lib/store";

/**
 * Elite virtual lounge UI wrapper —
 * entrance blast + global top-up sheet + onyx/cyan shell.
 * State covers standard streams, blind matches, and VIP entry effects.
 */
export function LoungeShell({
  children,
  minuteRate = 80,
  enableAutoTopUp = true,
}: {
  children: ReactNode;
  minuteRate?: number;
  enableAutoTopUp?: boolean;
}) {
  const {
    coins,
    topUpOpen,
    openTopUp,
    closeTopUp,
    topUpGrace,
    triggerEntranceBlast,
    vipTier,
    isPremium,
    entranceReady,
  } = useApp();
  const entranceOnce = useRef(false);
  const topUpOnce = useRef(false);

  useEffect(() => {
    if (!entranceReady || entranceOnce.current) return;
    if (vipTier === "diamond" || vipTier === "gold" || isPremium) {
      entranceOnce.current = true;
      triggerEntranceBlast();
    }
  }, [entranceReady, isPremium, triggerEntranceBlast, vipTier]);

  useEffect(() => {
    if (!enableAutoTopUp) return;
    if (coins < minuteRate && !topUpOpen && !topUpOnce.current) {
      topUpOnce.current = true;
      openTopUp(15);
    }
    if (coins >= minuteRate) {
      topUpOnce.current = false;
    }
  }, [coins, enableAutoTopUp, minuteRate, openTopUp, topUpOpen]);

  return (
    <div className="lounge-shell relative min-h-dvh overflow-hidden bg-[#06040b]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(0,240,255,0.14),transparent_55%)]" />
      <DiamondEntranceBlast />
      <div className="relative z-10">{children}</div>
      <TopUpSheet
        open={topUpOpen}
        onClose={closeTopUp}
        graceLeft={topUpGrace}
        minuteRate={minuteRate}
      />
    </div>
  );
}
