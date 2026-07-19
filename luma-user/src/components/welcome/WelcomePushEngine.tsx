"use client";

import { AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { IncomingCallLure } from "@/components/welcome/IncomingCallLure";
import { TeaserCallPlayer } from "@/components/welcome/TeaserCallPlayer";
import { RechargePaywallSheet } from "@/components/welcome/RechargePaywallSheet";
import { useWelcomePushCall } from "@/hooks/useWelcomePushCall";

/**
 * Welcome Push Call Engine — production shell injection.
 * State loop: IDLE → INCOMING_CALL → TEASER_PLAYING → PAYWALL_BOOST → DONE
 */
export function WelcomePushEngine() {
  const pathname = usePathname();
  const onHome = pathname === "/" || pathname === "";

  const {
    phase,
    host,
    offerLeft,
    acceptIncoming,
    rejectIncoming,
    closePaywall,
    hardDisconnectTeaser,
  } = useWelcomePushCall({ enabled: onHome });

  // Once funnel starts, keep overlays even if path flickers; hide only when idle/done
  if (phase === "IDLE" || phase === "DONE") return null;

  return (
    <>
      <AnimatePresence>
        {phase === "INCOMING_CALL" && (
          <IncomingCallLure
            key="incoming"
            host={host}
            onAccept={acceptIncoming}
            onReject={rejectIncoming}
          />
        )}
      </AnimatePresence>

      {phase === "TEASER_PLAYING" && (
        <TeaserCallPlayer host={host} onHardCut={hardDisconnectTeaser} />
      )}

      <RechargePaywallSheet
        open={phase === "PAYWALL_BOOST"}
        host={host}
        offerLeft={offerLeft}
        onClose={closePaywall}
      />
    </>
  );
}
