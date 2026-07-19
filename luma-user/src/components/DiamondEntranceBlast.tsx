"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useApp } from "@/lib/store";

/** Diamond VIP entrance blast across the phone-shell wrapper */
export function DiamondEntranceBlast() {
  const { entranceBlast, clearEntranceBlast, vipTier, isPremium } = useApp();
  const show =
    entranceBlast && (vipTier === "diamond" || isPremium || vipTier === "gold");

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-[80] overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onAnimationComplete={() => {
            window.setTimeout(() => clearEntranceBlast(), 2200);
          }}
        >
          <motion.div
            className="absolute inset-y-0 w-[40%] bg-gradient-to-r from-transparent via-cyan/50 to-transparent"
            initial={{ x: "-60%", skewX: -18 }}
            animate={{ x: "160%" }}
            transition={{ duration: 1.1, ease: "easeOut" }}
          />
          <motion.div
            className="absolute inset-y-0 w-[28%] bg-gradient-to-r from-transparent via-[#ff2a7a]/40 to-transparent"
            initial={{ x: "-40%", skewX: -12 }}
            animate={{ x: "170%" }}
            transition={{ duration: 1.25, delay: 0.12, ease: "easeOut" }}
          />
          <motion.div
            className="absolute left-1/2 top-1/3 -translate-x-1/2 rounded-full border border-cyan/60 bg-ink/70 px-5 py-2.5 shadow-[0_0_40px_rgba(0,240,255,0.55)]"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.1, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
          >
            <p className="font-display text-sm font-extrabold tracking-wide text-cyan">
              ✦ {vipTier === "diamond" ? "DIAMOND" : "VIP"} ENTRANCE
            </p>
          </motion.div>
          {[...Array(12)].map((_, i) => (
            <motion.span
              key={i}
              className="absolute h-1.5 w-1.5 rounded-full bg-cyan"
              style={{
                left: `${8 + (i * 7) % 84}%`,
                top: `${20 + (i * 11) % 60}%`,
                boxShadow: "0 0 10px #00f0ff",
              }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 1, 0], scale: [0, 1.4, 0], y: -40 }}
              transition={{ duration: 1.4, delay: 0.05 * i }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
