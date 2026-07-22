"use client";

import { CHAT_THEME } from "./chatTheme";

export function TypingIndicator({ label = "typing…" }: { label?: string }) {
  return (
    <div
      className="mb-2 inline-flex items-center gap-1 rounded-2xl px-3 py-2"
      style={{
        backgroundColor: CHAT_THEME.theirsBubble,
        border: `1px solid ${CHAT_THEME.border}`,
      }}
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ backgroundColor: CHAT_THEME.accent }} />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full delay-100" style={{ backgroundColor: CHAT_THEME.accent }} />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full delay-200" style={{ backgroundColor: CHAT_THEME.accent }} />
      <span className="ml-1 text-[11px] font-semibold" style={{ color: CHAT_THEME.muted }}>
        {label}
      </span>
    </div>
  );
}
