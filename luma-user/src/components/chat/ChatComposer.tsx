"use client";

import { Image as ImageIcon, Send } from "lucide-react";
import { CHAT_THEME } from "./chatTheme";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onPickImage?: () => void;
  sending?: boolean;
  placeholder?: string;
};

export function ChatComposer({
  value,
  onChange,
  onSend,
  onPickImage,
  sending,
  placeholder = "Message…",
}: Props) {
  const canSend = Boolean(value.trim()) && !sending;
  return (
    <div
      className="border-t px-3 pt-3"
      style={{
        borderColor: CHAT_THEME.border,
        backgroundColor: CHAT_THEME.bg,
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
    >
      {onPickImage ? (
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={onPickImage}
            className="rounded-full p-2.5"
            style={{ backgroundColor: CHAT_THEME.theirsBubble, color: CHAT_THEME.coral }}
          >
            <ImageIcon className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder={placeholder}
          className="max-h-28 min-h-[44px] flex-1 rounded-full border px-4 py-2.5 text-sm outline-none"
          style={{
            backgroundColor: CHAT_THEME.theirsBubble,
            borderColor: CHAT_THEME.border,
            color: CHAT_THEME.theirsText,
          }}
        />
        <button
          type="button"
          disabled={!canSend}
          onClick={onSend}
          className="flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-45"
          style={{ backgroundColor: CHAT_THEME.mineBubble, color: "#fff" }}
        >
          {sending ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
