/** Shared chat visual tokens — keep in sync with Host src/components/chat/chatTheme.ts */
export const CHAT_THEME = {
  bg: "#06040b",
  headerBg: "rgba(6, 4, 11, 0.92)",
  border: "rgba(0, 240, 255, 0.15)",
  mineBubble: "#6C7CFF",
  theirsBubble: "#141C2E",
  mineText: "#FFFFFF",
  theirsText: "#F4F7FF",
  muted: "#7E89B0",
  accent: "#5CE1E6",
  coral: "#FF2A7A",
} as const;

export type ChatMessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";
