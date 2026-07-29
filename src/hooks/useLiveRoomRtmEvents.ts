import { useCallback, useEffect, useRef, useState } from 'react';
import { useGiftAnimationQueue } from '../context/GiftAnimationQueueContext';
import {
  subscribeLiveRoomRtm,
  type LiveRoomGiftRtmEvent,
  type LiveRoomStatsRtmEvent,
  type LiveRoomStreamStateRtmEvent,
} from '../services/liveRoomRtmService';

export type LiveRoomRtmStats = {
  totalCoins?: number;
  viewerCount?: number;
  hostEarnings?: number;
  hostMuted?: boolean;
  hostCameraOff?: boolean;
  ended?: boolean;
};

export function useLiveRoomRtmEvents(input: {
  roomId: string;
  channel?: string;
  userId: string;
  enabled: boolean;
  onGift?: (event: LiveRoomGiftRtmEvent) => void;
  onStats?: (event: LiveRoomStatsRtmEvent) => void;
  onStreamState?: (event: LiveRoomStreamStateRtmEvent) => void;
}) {
  const { roomId, channel, userId, enabled, onGift, onStats, onStreamState } = input;
  const { enqueueGiftAnimation } = useGiftAnimationQueue();
  const [stats, setStats] = useState<LiveRoomRtmStats>({});
  const seenGiftIds = useRef(new Set<string>());

  const handleGift = useCallback(
    (event: LiveRoomGiftRtmEvent) => {
      if (seenGiftIds.current.has(event.id)) return;
      seenGiftIds.current.add(event.id);
      if (seenGiftIds.current.size > 120) {
        seenGiftIds.current = new Set([...seenGiftIds.current].slice(-60));
      }
      enqueueGiftAnimation({
        id: event.id,
        source: event.lottie.source,
        title: 'Gift Sent',
        senderName: event.fromName,
        giftName: `${event.giftEmoji} ${event.giftName}${event.combo > 1 ? ` x${event.combo}` : ''}`,
        coins: event.coins * Math.max(1, event.combo || 1),
        durationMs: event.lottie.durationMs,
      });
      setStats((current) => ({
        ...current,
        totalCoins: event.totals?.totalCoins ?? current.totalCoins,
        viewerCount: event.totals?.viewerCount ?? current.viewerCount,
        hostEarnings: event.totals?.hostEarnings ?? current.hostEarnings,
      }));
      onGift?.(event);
    },
    [enqueueGiftAnimation, onGift],
  );

  const handleStats = useCallback(
    (event: LiveRoomStatsRtmEvent) => {
      setStats((current) => ({
        ...current,
        totalCoins: event.totalCoins ?? current.totalCoins,
        viewerCount:
          event.viewerCount ??
          (typeof event.viewerDelta === 'number'
            ? Math.max(0, (current.viewerCount || 0) + event.viewerDelta)
            : current.viewerCount),
        hostEarnings: event.hostEarnings ?? current.hostEarnings,
      }));
      onStats?.(event);
    },
    [onStats],
  );

  const handleStreamState = useCallback(
    (event: LiveRoomStreamStateRtmEvent) => {
      setStats((current) => ({
        ...current,
        hostMuted: event.muted ?? current.hostMuted,
        hostCameraOff: event.cameraOff ?? current.hostCameraOff,
        ended: event.ended ?? current.ended,
      }));
      onStreamState?.(event);
    },
    [onStreamState],
  );

  useEffect(() => {
    if (!enabled || !roomId || !userId) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    void subscribeLiveRoomRtm({
      roomId,
      channel,
      userId,
      onEvent: (event) => {
        if (event.type === 'live_gift') handleGift(event);
        if (event.type === 'live_stats') handleStats(event);
        if (event.type === 'live_stream_state') handleStreamState(event);
      },
    }).then((fn) => {
      if (cancelled) fn();
      else cleanup = fn;
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [channel, enabled, handleGift, handleStats, handleStreamState, roomId, userId]);

  return { stats };
}
