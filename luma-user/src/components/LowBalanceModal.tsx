"use client";

import { TopUpSheet } from "@/components/TopUpSheet";

/** Back-compat wrapper — routes low-balance UX through TopUpSheet */
export function LowBalanceModal({
  open,
  graceLeft,
  onDismiss,
  minuteRate,
}: {
  open: boolean;
  graceLeft: number;
  onDismiss?: () => void;
  minuteRate?: number;
}) {
  return (
    <TopUpSheet
      open={open}
      onClose={onDismiss ?? (() => undefined)}
      graceLeft={graceLeft}
      minuteRate={minuteRate}
    />
  );
}
