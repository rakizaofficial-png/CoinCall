"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useApp } from "@/lib/store";

export function ToastHost() {
  const { toasts } = useApp();

  return (
    <div className="pointer-events-none fixed left-1/2 top-16 z-[60] w-full max-w-[430px] -translate-x-1/2 px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-2 rounded-2xl border border-line bg-ink-3/95 px-4 py-3 text-center text-sm font-medium text-sand shadow-lg backdrop-blur-md"
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
