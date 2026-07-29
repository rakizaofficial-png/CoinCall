"use client";

import Lottie from "lottie-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type QueuedGiftAnimation = {
  id: string;
  giftId: string;
  giftName: string;
  emoji: string;
  senderName?: string;
  coins?: number;
  combo?: number;
  source?: string;
  durationMs?: number;
};

type QueueContextValue = {
  enqueueGift: (gift: QueuedGiftAnimation) => void;
  clearGifts: () => void;
};

const QueueContext = createContext<QueueContextValue | null>(null);
const animationCache = new Map<string, object>();
const MAX_QUEUE_SIZE = 20;

function GiftAnimationStage({
  item,
  onDone,
}: {
  item: QueuedGiftAnimation;
  onDone: () => void;
}) {
  const [animationData, setAnimationData] = useState<object | null>(
    item.source ? animationCache.get(item.source) || null : null,
  );

  useEffect(() => {
    let active = true;
    if (!item.source || animationCache.has(item.source)) return;
    void fetch(item.source)
      .then((response) => {
        if (!response.ok) throw new Error(`Lottie ${response.status}`);
        return response.json() as Promise<object>;
      })
      .then((data) => {
        animationCache.set(item.source!, data);
        if (active) setAnimationData(data);
      })
      .catch(() => {
        // Emoji spectacle remains visible if a CDN animation is unavailable.
      });
    return () => {
      active = false;
    };
  }, [item.source]);

  useEffect(() => {
    const timer = window.setTimeout(onDone, Math.max(1800, item.durationMs || 4200));
    return () => window.clearTimeout(timer);
  }, [item.durationMs, item.id, onDone]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[220] flex items-center justify-center overflow-hidden bg-black/15">
      {animationData ? (
        <Lottie
          animationData={animationData}
          autoplay
          loop={false}
          onComplete={onDone}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="gift-float text-[7rem] drop-shadow-[0_0_40px_rgba(255,184,0,0.85)]">
          {item.emoji}
        </div>
      )}
      <div className="absolute bottom-[14%] left-6 right-6 mx-auto max-w-sm rounded-full border border-white/20 bg-black/60 px-5 py-3 text-center backdrop-blur">
        <p className="truncate font-display text-sm font-extrabold text-white">
          {item.senderName || "A fan"} sent {item.giftName}
          {item.combo && item.combo > 1 ? ` ×${item.combo}` : ""}
        </p>
        {item.coins ? (
          <p className="mt-0.5 text-xs font-bold text-gold">
            {(item.coins * Math.max(1, item.combo || 1)).toLocaleString()} coins
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function GiftAnimationQueueProvider({ children }: { children: ReactNode }) {
  const queueRef = useRef<QueuedGiftAnimation[]>([]);
  const seenRef = useRef(new Set<string>());
  const [current, setCurrent] = useState<QueuedGiftAnimation | null>(null);

  const playNext = useCallback(() => {
    setCurrent((playing) => playing || queueRef.current.shift() || null);
  }, []);

  const enqueueGift = useCallback(
    (gift: QueuedGiftAnimation) => {
      if (!gift.id || seenRef.current.has(gift.id)) return;
      seenRef.current.add(gift.id);
      if (seenRef.current.size > 250) {
        seenRef.current = new Set(Array.from(seenRef.current).slice(-150));
      }
      queueRef.current.push(gift);
      if (queueRef.current.length > MAX_QUEUE_SIZE) {
        queueRef.current.splice(0, queueRef.current.length - MAX_QUEUE_SIZE);
      }
      playNext();
    },
    [playNext],
  );

  const onDone = useCallback(() => {
    setCurrent(null);
    window.requestAnimationFrame(playNext);
  }, [playNext]);

  const clearGifts = useCallback(() => {
    queueRef.current = [];
    seenRef.current.clear();
    setCurrent(null);
  }, []);

  const value = useMemo(() => ({ enqueueGift, clearGifts }), [clearGifts, enqueueGift]);

  return (
    <QueueContext.Provider value={value}>
      {children}
      {current ? <GiftAnimationStage key={current.id} item={current} onDone={onDone} /> : null}
    </QueueContext.Provider>
  );
}

export function useGiftAnimationQueue() {
  const value = useContext(QueueContext);
  if (!value) throw new Error("useGiftAnimationQueue requires GiftAnimationQueueProvider");
  return value;
}
