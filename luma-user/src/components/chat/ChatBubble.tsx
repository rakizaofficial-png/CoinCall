"use client";

import Image from "next/image";
import { CHAT_THEME, type ChatMessageStatus } from "./chatTheme";
import { formatChatTime } from "./formatChatTime";

export type ChatBubbleMessage = {
  id: string;
  text: string;
  createdAt: number;
  imageUrl?: string;
  fromMe: boolean;
  status?: ChatMessageStatus;
};

function receiptLabel(status?: ChatMessageStatus) {
  if (status === "sending") return "…";
  if (status === "failed") return "!";
  if (status === "read") return "✓✓";
  if (status === "delivered" || status === "sent") return "✓";
  return "";
}

export function ChatBubble({
  message,
  onImagePress,
}: {
  message: ChatBubbleMessage;
  onImagePress?: (uri: string) => void;
}) {
  const mine = message.fromMe;
  const receipt = mine ? receiptLabel(message.status) : "";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[78%] rounded-2xl px-3.5 py-2.5"
        style={{
          backgroundColor: mine ? CHAT_THEME.mineBubble : CHAT_THEME.theirsBubble,
          color: mine ? CHAT_THEME.mineText : CHAT_THEME.theirsText,
          borderBottomRightRadius: mine ? 6 : 18,
          borderBottomLeftRadius: mine ? 18 : 6,
          border: mine ? "none" : `1px solid ${CHAT_THEME.border}`,
        }}
      >
        {message.imageUrl ? (
          <button type="button" onClick={() => onImagePress?.(message.imageUrl!)} className="mb-2 block">
            <Image
              src={message.imageUrl}
              alt="attachment"
              width={180}
              height={180}
              unoptimized
              className="rounded-xl object-cover"
            />
          </button>
        ) : null}
        {message.text ? <p className="text-sm leading-relaxed">{message.text}</p> : null}
        <div className="mt-1 flex items-center justify-end gap-1.5">
          <span className="text-[10px] font-semibold text-white/55">
            {formatChatTime(message.createdAt)}
          </span>
          {receipt ? (
            <span className="text-[10px] font-extrabold text-white/75">{receipt}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
