"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Gift, Video } from "lucide-react";
import { creators, getCreator, threads } from "@/lib/data";
import { useApp } from "@/lib/store";
import { GiftSheet } from "@/components/GiftSheet";
import { WalletDiamond } from "@/components/WalletDiamond";
import { requireApiBase } from "@/config/apiConfig";
import { getDeviceUserId } from "@/lib/walletApi";
import { ChatBubble, type ChatBubbleMessage } from "@/components/chat/ChatBubble";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatThreadLayout } from "@/components/chat/ChatThreadLayout";
import { ImageViewerModal } from "@/components/chat/ImageViewerModal";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { CHAT_THEME } from "@/components/chat/chatTheme";

type ApiMessage = {
  id: string;
  fromId: string;
  toId: string;
  text: string;
  createdAt: number;
  imageUrl?: string;
  readAt?: number;
};

export default function ChatThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { vipTier, triggerEntranceBlast, inbox, markInboxRead, pushToast } = useApp();
  const userId = getDeviceUserId();
  const listEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const hostIdFromRoute = id.startsWith("host_")
    ? decodeURIComponent(id.slice(5))
    : null;

  const thread = threads.find((t) => t.id === id) ?? null;
  const mockCreator = thread ? getCreator(thread.creatorId) ?? creators[0] : null;

  const hostId = hostIdFromRoute || mockCreator?.id || "host";
  const hostName =
    inbox.find((m) => m.hostId === hostId)?.hostName ||
    mockCreator?.name ||
    "Host";
  const hostImage =
    mockCreator?.image ||
    `https://i.pravatar.cc/200?u=${encodeURIComponent(hostId)}`;

  // Mark this thread's messages as read when opening
  useEffect(() => {
    markInboxRead();
  }, [markInboxRead]);

  const massNotes = useMemo(
    () =>
      inbox
        .filter((m) => m.hostId === hostId)
        .map((m) => ({
          id: `mass_${m.at}`,
          fromId: hostId,
          toId: userId,
          text: m.text,
          createdAt: m.at,
        })),
    [hostId, inbox, userId],
  );

  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([]);
  const [pending, setPending] = useState<ChatBubbleMessage[]>([]);
  const [text, setText] = useState("");
  const [giftOpen, setGiftOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [peerTyping] = useState(false);

  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch(
        `${requireApiBase()}/dm/messages?a=${encodeURIComponent(userId)}&b=${encodeURIComponent(hostId)}&viewerId=${encodeURIComponent(userId)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as { messages?: ApiMessage[] };
      if (data.messages?.length) setApiMessages(data.messages);
    } catch {
      /* keep local */
    }
  }, [hostId, userId]);

  useEffect(() => {
    let active = true;
    const doFetch = async () => {
      if (!active) return;
      await loadMessages();
    };
    void doFetch();
    const t = setInterval(() => { void doFetch(); }, 4000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [loadMessages]);

  const bubbles = useMemo<ChatBubbleMessage[]>(() => {
    const mergedMap = new Map<string, ChatBubbleMessage>();
    for (const m of [...massNotes, ...apiMessages]) {
      mergedMap.set(m.id, {
        id: m.id,
        text: m.text,
        createdAt: m.createdAt,
        imageUrl: (m as ApiMessage).imageUrl,
        fromMe: m.fromId === userId,
        status:
          m.fromId === userId
            ? (m as ApiMessage).readAt
              ? "read"
              : "delivered"
            : undefined,
      });
    }
    for (const p of pending) mergedMap.set(p.id, p);
    return [...mergedMap.values()].sort((a, b) => a.createdAt - b.createdAt);
  }, [apiMessages, massNotes, pending, userId]);

  // Auto-scroll only when near bottom (within 120px)
  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  useEffect(() => {
    if (isNearBottom()) {
      listEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [bubbles.length, isNearBottom]);

  const send = async (imageUrl?: string) => {
    const body = text.trim();
    if (!body && !imageUrl) return;
    if (sending) return;
    if (vipTier === "diamond") triggerEntranceBlast();
    const tempId = `pending_${Date.now()}`;
    const optimistic: ChatBubbleMessage = {
      id: tempId,
      text: body || "📷 Photo",
      createdAt: Date.now(),
      imageUrl,
      fromMe: true,
      status: "sending",
    };
    setPending((p) => [...p, optimistic]);
    setText("");
    setSending(true);

    // Scroll to bottom after sending
    setTimeout(() => listEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    try {
      const res = await fetch(`${requireApiBase()}/dm/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": userId,
        },
        body: JSON.stringify({
          fromId: userId,
          toId: hostId,
          text: body || "📷 Photo",
          imageUrl,
          fromName: "Luma Fan",
          fromRole: "user",
          peerName: hostName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Message failed");
      setPending((p) => p.filter((m) => m.id !== tempId));
      await loadMessages();
    } catch (e) {
      setPending((p) =>
        p.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)),
      );
      pushToast?.(e instanceof Error ? e.message : "Could not send message");
    } finally {
      setSending(false);
    }
  };

  const header = (
    <div className="flex items-center gap-3 px-3 pb-3">
      <Link
        href="/messages"
        className="rounded-full p-2"
        style={{ backgroundColor: CHAT_THEME.theirsBubble, color: CHAT_THEME.accent }}
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <Image
        src={hostImage}
        alt={hostName}
        width={40}
        height={40}
        unoptimized
        className="h-10 w-10 rounded-full object-cover ring-2"
        style={{ borderColor: CHAT_THEME.border }}
      />
      <div className="min-w-0 flex-1">
        <p className="font-display font-bold leading-tight text-sand">{hostName}</p>
        <p className="text-[11px] font-semibold" style={{ color: CHAT_THEME.accent }}>
          {peerTyping ? "typing…" : "Host · DM"}
        </p>
      </div>
      <WalletDiamond compact />
      <Link
        href={`/call/${encodeURIComponent(hostId)}?live=1`}
        className="rounded-full p-2.5"
        style={{ backgroundColor: CHAT_THEME.coral, color: "#fff" }}
      >
        <Video className="h-4 w-4" />
      </Link>
    </div>
  );

  return (
    <>
      <ChatThreadLayout
        header={header}
        scrollRef={scrollContainerRef}
        composer={
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const url = URL.createObjectURL(file);
                void send(url);
                e.target.value = "";
              }}
            />
            <ChatComposer
              value={text}
              onChange={setText}
              onSend={() => void send()}
              onPickImage={() => fileRef.current?.click()}
              sending={sending}
            />
            <div className="px-3 pb-2">
              <button
                type="button"
                onClick={() => setGiftOpen(true)}
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold"
                style={{ backgroundColor: CHAT_THEME.theirsBubble, color: CHAT_THEME.coral }}
              >
                <Gift className="h-3.5 w-3.5" /> Send gift
              </button>
            </div>
          </>
        }
      >
        <div className="space-y-3">
          {bubbles.length === 0 ? (
            <p className="py-6 text-center text-sm" style={{ color: CHAT_THEME.muted }}>
              Say hi to start the chat 👋
            </p>
          ) : null}
          {bubbles.map((m) => (
            <ChatBubble key={m.id} message={m} onImagePress={setViewerUri} />
          ))}
          {peerTyping ? <TypingIndicator /> : null}
          <div ref={listEndRef} />
        </div>
      </ChatThreadLayout>

      <GiftSheet open={giftOpen} onClose={() => setGiftOpen(false)} hostId={hostId} />
      <ImageViewerModal uri={viewerUri} onClose={() => setViewerUri(null)} />
    </>
  );
}
