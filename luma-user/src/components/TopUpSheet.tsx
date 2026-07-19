"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Coins, Sparkles, X, Zap } from "lucide-react";
import { IAP_PRODUCTS } from "@/lib/payments/iapCatalog";
import { purchaseCoins } from "@/lib/payments/iap";
import { useApp } from "@/lib/store";

/**
 * Production top-up sheet — Google Play / Apple IAP via backend verify.
 */
export function TopUpSheet({
  open,
  onClose,
  graceLeft,
  minuteRate,
}: {
  open: boolean;
  onClose: () => void;
  graceLeft?: number;
  minuteRate?: number;
}) {
  const { userId, pushToast, syncWallet } = useApp();
  const [busy, setBusy] = useState<string | null>(null);

  const buy = async (productId: string) => {
    if (!userId) {
      pushToast("Wallet not ready — retry in a moment");
      return;
    }
    setBusy(productId);
    try {
      const result = await purchaseCoins({ userId, productId });
      if ("redirected" in result) {
        pushToast("Redirecting to Play Store checkout…");
        return;
      }
      await syncWallet();
      pushToast(`+${result.credited} coins added`);
      onClose();
    } catch (e: unknown) {
      pushToast(e instanceof Error ? e.message : "Purchase failed");
    } finally {
      setBusy(null);
    }
  };

  const tiers = IAP_PRODUCTS.slice(0, 3);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close top-up"
            className="fixed inset-0 z-[70] bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed bottom-0 left-1/2 z-[75] w-full max-w-[430px] -translate-x-1/2 rounded-t-[1.75rem] border border-cyan/35 bg-[#0a0812]/98 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-24px_80px_rgba(0,240,255,0.18)] backdrop-blur-xl"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-cyan/40" />
            <div className="mb-1 flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan">
                  <Zap className="h-3.5 w-3.5" /> Live wallet recharge
                </p>
                <h3 className="mt-1 font-display text-xl font-extrabold text-sand">
                  Google Play / App Store
                </h3>
                <p className="mt-1 text-xs text-cyan/80">
                  {minuteRate
                    ? `Below 1-minute rate (${minuteRate} coins)`
                    : "Server-verified IAP credit"}
                  {graceLeft != null ? ` · ${graceLeft}s grace` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-cyan/25 bg-ink-3 p-2 text-cyan"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              {tiers.map((tier, i) => {
                const total = tier.coins + tier.bonusCoins;
                return (
                  <motion.button
                    key={tier.productId}
                    type="button"
                    disabled={busy === tier.productId}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i }}
                    onClick={() => void buy(tier.productId)}
                    className={`flex w-full items-center gap-3 rounded-2xl border bg-ink-2/90 px-4 py-3.5 text-left ${
                      tier.popular
                        ? "border-coral/50 shadow-[0_0_24px_rgba(255,42,122,0.28)]"
                        : "border-cyan/45 shadow-[0_0_24px_rgba(0,240,255,0.28)]"
                    }`}
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan/15 text-cyan">
                      {tier.popular ? (
                        <Sparkles className="h-5 w-5 text-gold" />
                      ) : (
                        <Coins className="h-5 w-5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm font-bold text-sand">
                        {tier.title}
                      </p>
                      <p className="text-[11px] text-cyan/75">
                        {total.toLocaleString()} coins
                        {tier.bonusCoins ? ` · +${tier.bonusCoins} bonus` : ""} ·{" "}
                        {tier.productId}
                      </p>
                    </div>
                    <span className="font-display text-lg font-extrabold text-cyan">
                      {busy === tier.productId ? "…" : tier.priceLabel}
                    </span>
                  </motion.button>
                );
              })}
            </div>
            <p className="mt-3 text-center text-[10px] text-cyan/60">
              Credits apply only after `/api/wallet/iap/verify` succeeds
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
