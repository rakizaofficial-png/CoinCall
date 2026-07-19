"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Gem } from "lucide-react";
import { useApp } from "@/lib/store";

/** Pulsing metallic diamond wallet indicator */
export function WalletDiamond({ compact }: { compact?: boolean }) {
  const { coins } = useApp();

  return (
    <Link
      href="/wallet"
      className={`wallet-diamond relative flex items-center gap-1.5 rounded-full border border-cyan/40 bg-ink-3/90 ${
        compact ? "h-9 px-2.5" : "h-10 px-3"
      }`}
    >
      <span className="diamond-pulse relative flex h-6 w-6 items-center justify-center">
        <Gem className="relative z-10 h-4 w-4 text-cyan" strokeWidth={2.4} />
        <span className="diamond-ring absolute inset-0 rounded-full" />
      </span>
      <span className="text-sm font-bold tabular-nums text-sand">
        {coins.toLocaleString()}
      </span>
      <motion.span
        className="pointer-events-none absolute inset-0 rounded-full border border-cyan/30"
        animate={{ opacity: [0.35, 0.9, 0.35], scale: [1, 1.04, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
    </Link>
  );
}
