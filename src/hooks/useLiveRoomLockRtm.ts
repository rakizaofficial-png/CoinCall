import { useCallback, useEffect, useState } from 'react';
import {
  fetchLiveRoomAccess,
  payLockedLiveEntry,
  subscribeLiveRoomLockRtm,
  type LiveRoomLockRtmEvent,
} from '../services/liveRoomRtmService';

export function useLiveRoomLockRtm(input: {
  roomId: string;
  channel?: string;
  userId: string;
  userName: string;
  enabled: boolean;
  onKick: () => Promise<void> | void;
}) {
  const { roomId, channel, userId, userName, enabled, onKick } = input;
  const [locked, setLocked] = useState(false);
  const [entryFee, setEntryFee] = useState(0);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  const enforceLock = useCallback(
    async (event?: LiveRoomLockRtmEvent) => {
      if (!enabled || !roomId || !userId) return;
      const feeFromEvent = event?.entryLocked ? event.entryFee : 0;
      if (event && (!event.entryLocked || event.entryFee <= 0)) {
        setLocked(false);
        setEntryFee(0);
        return;
      }
      try {
        const access = await fetchLiveRoomAccess({
          roomId,
          userId,
        });
        if (access.allowed) {
          setLocked(false);
          setEntryFee(0);
          return;
        }
        const nextFee = access.entryFee || feeFromEvent;
        setEntryFee(nextFee);
        setLocked(nextFee > 0);
        if (nextFee > 0) await onKick();
      } catch (e) {
        const nextFee = feeFromEvent || 0;
        setEntryFee(nextFee);
        setLocked(nextFee > 0);
        setError(e instanceof Error ? e.message : 'Live room locked');
        if (nextFee > 0) await onKick();
      }
    },
    [enabled, onKick, roomId, userId],
  );

  useEffect(() => {
    if (!enabled || !roomId || !userId) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    void enforceLock();
    void subscribeLiveRoomLockRtm({
      roomId,
      channel,
      userId,
      onLock: (event) => void enforceLock(event),
    }).then((fn) => {
      if (cancelled) fn();
      else cleanup = fn;
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [channel, enabled, enforceLock, roomId, userId]);

  const pay = useCallback(async () => {
    setPaying(true);
    setError('');
    try {
      await payLockedLiveEntry({
        roomId,
        userId,
        userName,
      });
      setLocked(false);
      setEntryFee(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not unlock live');
      throw e;
    } finally {
      setPaying(false);
    }
  }, [roomId, userId, userName]);

  const decline = useCallback(async () => {
    setLocked(false);
    await onKick();
  }, [onKick]);

  return { locked, entryFee, paying, error, pay, decline };
}
