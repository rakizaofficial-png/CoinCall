import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  GiftAnimationPlayer,
  type GiftAnimationItem,
  type GiftLottieSource,
} from '../components/gifts/GiftAnimationPlayer';

type EnqueueGiftAnimationInput = Omit<GiftAnimationItem, 'id'> & {
  id?: string;
};

type GiftAnimationQueueValue = {
  current: GiftAnimationItem | null;
  queueLength: number;
  enqueueGiftAnimation: (gift: EnqueueGiftAnimationInput) => void;
  clearGiftAnimations: () => void;
};

const GiftAnimationQueueContext =
  createContext<GiftAnimationQueueValue | undefined>(undefined);

function createGiftAnimationId() {
  return `gift_lottie_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function GiftAnimationQueueProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [current, setCurrent] = useState<GiftAnimationItem | null>(null);
  const [queueLength, setQueueLength] = useState(0);
  const queueRef = useRef<GiftAnimationItem[]>([]);
  const playingRef = useRef(false);
  const currentIdRef = useRef<string | null>(null);

  const playNext = useCallback(() => {
    if (playingRef.current) return;
    const next = queueRef.current.shift() || null;
    setQueueLength(queueRef.current.length);
    if (!next) {
      currentIdRef.current = null;
      setCurrent(null);
      return;
    }
    playingRef.current = true;
    currentIdRef.current = next.id;
    setCurrent(next);
  }, []);

  const enqueueGiftAnimation = useCallback(
    (gift: EnqueueGiftAnimationInput) => {
      const item: GiftAnimationItem = {
        ...gift,
        id: gift.id || createGiftAnimationId(),
      };
      queueRef.current.push(item);
      setQueueLength(queueRef.current.length);
      playNext();
    },
    [playNext],
  );

  const onFinish = useCallback((itemId: string) => {
    if (currentIdRef.current !== itemId) return;
    currentIdRef.current = null;
    playingRef.current = false;
    setCurrent(null);
    requestAnimationFrame(playNext);
  }, [playNext]);

  const clearGiftAnimations = useCallback(() => {
    queueRef.current = [];
    playingRef.current = false;
    currentIdRef.current = null;
    setQueueLength(0);
    setCurrent(null);
  }, []);

  const value = useMemo(
    () => ({
      current,
      queueLength,
      enqueueGiftAnimation,
      clearGiftAnimations,
    }),
    [clearGiftAnimations, current, enqueueGiftAnimation, queueLength],
  );

  return (
    <GiftAnimationQueueContext.Provider value={value}>
      {children}
      <GiftAnimationPlayer item={current} onFinish={onFinish} />
    </GiftAnimationQueueContext.Provider>
  );
}

export function useGiftAnimationQueue() {
  const ctx = useContext(GiftAnimationQueueContext);
  if (!ctx) {
    throw new Error(
      'useGiftAnimationQueue must be used inside GiftAnimationQueueProvider',
    );
  }
  return ctx;
}

export type { GiftLottieSource, GiftAnimationItem };
