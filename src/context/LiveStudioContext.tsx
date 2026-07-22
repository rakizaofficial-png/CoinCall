import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { GIFT_CATALOG, PHOTO_UNLOCK_MIN_COINS } from '../data/gifts';
import { useApp } from '../context/AppContext';
import {
  endLiveRoom,
  listenLiveRooms,
  listenLockedPhotos,
  listenRoomComments,
  listenRoomGifts,
  pinAnnouncement,
  postRoomComment,
  publishLiveRoom,
  sendRoomGift,
  addLockedPhoto,
  unlockLivePhoto,
  updateLiveRoomLock,
  updatePartySeats,
  updateRoomTitle,
  type LiveComment,
  type LiveGiftEvent,
  type LiveRoom,
  type LockedLivePhoto,
  type PartySeatPublic,
} from '../services/liveRoomService';
import {
  createAdminSupportTicket,
  listenRechargeBoard,
  massTextAllActiveUsers,
  reportRoomRecharge,
  type RechargeUserRow,
} from '../services/hostOutreachService';
import { syncHostPresence } from '../services/realtimeService';
import { publishHostPresence } from '../services/callBridge';
import { setBridgeLive } from '../services/hostBridgeState';
import { notify } from '../utils/notify';

type GoLiveDraft = {
  title: string;
  category: string;
  language: string;
  thumbnailUrl: string;
  beautyOn: boolean;
  facing: 'user' | 'environment';
  entryLocked: boolean;
  entryFee: number;
};

type LiveStudioValue = {
  liveRooms: LiveRoom[];
  myLiveRoom: LiveRoom | null;
  activeRoomId: string | null;
  comments: LiveComment[];
  gifts: LiveGiftEvent[];
  giftOverlay: LiveGiftEvent | null;
  lockedPhotos: LockedLivePhoto[];
  rechargeTicker: { userName: string; coins: number; userId?: string } | null;
  rechargeUsers: RechargeUserRow[];
  goLiveDraft: GoLiveDraft;
  setGoLiveDraft: (patch: Partial<GoLiveDraft>) => void;
  startSoloLive: () => Promise<LiveRoom>;
  startPartyLive: () => Promise<LiveRoom>;
  stopLive: () => Promise<void>;
  /** Pause Agora publish for private call — keep live room listed */
  pauseLiveForPrivateCall: () => Promise<void>;
  /** After private call — mark ready to rejoin live Agora */
  resumeLiveAfterCall: () => Promise<{ roomId: string; channel: string } | null>;
  livePausedForCall: boolean;
  openRoom: (roomId: string) => void;
  closeRoomView: () => void;
  sendComment: (text: string) => Promise<void>;
  sendImageComment: (imageUrl: string, caption?: string) => Promise<void>;
  sendGift: (giftId: string) => Promise<void>;
  likeRoom: () => void;
  setAnnouncement: (text: string) => Promise<void>;
  renameRoom: (title: string) => Promise<void>;
  updateSeats: (seats: PartySeatPublic[]) => Promise<void>;
  massTextAllActive: (text: string) => Promise<number>;
  contactAdminSupport: (text: string) => Promise<void>;
  addGiftLockedPhoto: (url: string, caption?: string, unlockCoins?: number) => Promise<void>;
  unlockPhotoWithGift: (photoId: string) => Promise<void>;
  simulateViewerRecharge: () => Promise<void>;
  muteUser: (userId: string) => void;
  kickUser: (userId: string) => void;
  blockUserInRoom: (userId: string) => void;
  updateRoomLock: (opts: { entryLocked: boolean; entryFee: number }) => Promise<void>;
  mutedUserIds: string[];
  blockedInRoom: string[];
  liveSeconds: number;
  todayLiveGiftCoins: number;
  monthlyEarn: number;
};

const LiveStudioContext = createContext<LiveStudioValue | undefined>(undefined);

function emptySeats(): PartySeatPublic[] {
  return Array.from({ length: 6 }).map((_, index) => ({
    index,
    locked: false,
    kind: index < 4 ? 'video' : 'audio',
    hostId: null,
    name: '',
    avatarUrl: '',
    micOn: false,
    camOn: false,
  }));
}

export function LiveStudioProvider({ children }: { children: React.ReactNode }) {
  const {
    user,
    setHostOnline,
    hostOnline,
    hostEarnings,
    hostLifetime,
    todayLiveSeconds,
    bumpTodayLiveSeconds,
    refreshTodayStats,
  } = useApp();
  const [liveRooms, setLiveRooms] = useState<LiveRoom[]>([]);
  const [myLiveRoom, setMyLiveRoom] = useState<LiveRoom | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [gifts, setGifts] = useState<LiveGiftEvent[]>([]);
  const [giftOverlay, setGiftOverlay] = useState<LiveGiftEvent | null>(null);
  const giftQueueRef = useRef<LiveGiftEvent[]>([]);
  const giftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceGiftRef = useRef<() => void>(() => {});

  // Keep advance function current without stale closures
  useEffect(() => {
    advanceGiftRef.current = () => {
      if (giftTimerRef.current) {
        clearTimeout(giftTimerRef.current);
        giftTimerRef.current = null;
      }
      const next = giftQueueRef.current.shift();
      if (next) {
        setGiftOverlay(next);
        giftTimerRef.current = setTimeout(() => {
          giftTimerRef.current = null;
          setGiftOverlay(null);
          advanceGiftRef.current();
        }, 2500);
      } else {
        setGiftOverlay(null);
      }
    };
  });

  const enqueueGiftOverlay = useCallback((gift: LiveGiftEvent) => {
    giftQueueRef.current.push(gift);
    // Only start processing if nothing is currently showing
    if (!giftTimerRef.current) {
      advanceGiftRef.current();
    }
  }, []);
  const [lockedPhotos, setLockedPhotos] = useState<LockedLivePhoto[]>([]);
  const [rechargeTicker, setRechargeTicker] = useState<{
    userName: string;
    coins: number;
    userId?: string;
  } | null>(null);
  const [rechargeUsers, setRechargeUsers] = useState<RechargeUserRow[]>([]);
  const [mutedUserIds, setMutedUserIds] = useState<string[]>([]);
  const [blockedInRoom, setBlockedInRoom] = useState<string[]>([]);
  const [sessionLiveSeconds, setSessionLiveSeconds] = useState(0);
  const [todayLiveGiftCoins, setTodayLiveGiftCoins] = useState(0);
  const [livePausedForCall, setLivePausedForCall] = useState(false);
  const [goLiveDraft, setDraft] = useState<GoLiveDraft>({
    title: `${user.name}'s Live`,
    category: 'Beauty',
    language: 'English',
    thumbnailUrl: user.avatarUrl,
    beautyOn: true,
    facing: 'user',
    entryLocked: false,
    entryFee: 50,
  });

  const setGoLiveDraft = useCallback((patch: Partial<GoLiveDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  useEffect(() => listenLiveRooms(setLiveRooms), []);

  // Going offline ends live so the room disappears from user + host lists
  useEffect(() => {
    if (hostOnline) return;
    if (!myLiveRoom?.isLive) return;
    const roomId = myLiveRoom.id;
    void (async () => {
      try {
        await endLiveRoom(roomId, user.id);
      } catch {
        /* ignore */
      }
      setMyLiveRoom(null);
      setActiveRoomId(null);
      setBridgeLive(false);
      void publishHostPresence({
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl || user.photoUrl,
        photoUrl: user.photoUrl || user.avatarUrl,
        country: user.country,
        ratePerMinute: 80,
        isOnline: false,
        isLive: false,
        isOnCall: false,
      }).catch(() => undefined);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostOnline, myLiveRoom?.id, myLiveRoom?.isLive, user.id]);

  useEffect(() => listenRechargeBoard((users) => setRechargeUsers(users)), []);

  useEffect(() => {
    if (!activeRoomId) {
      setComments([]);
      setGifts([]);
      setLockedPhotos([]);
      return;
    }
    const u1 = listenRoomComments(activeRoomId, setComments);
    const u2 = listenRoomGifts(activeRoomId, (items) => {
      setGifts(items);
      if (items[0] && Date.now() - items[0].createdAt < 4000) {
        enqueueGiftOverlay(items[0]);
      }
    });
    const u3 = listenLockedPhotos(activeRoomId, setLockedPhotos);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [activeRoomId]);

  useEffect(() => {
    if (!activeRoomId || !user.id) return;
    let es: EventSource | null = null;
    try {
      const base = (process.env.EXPO_PUBLIC_API_BASE_URL || 'https://coincall-api.onrender.com/api').replace(/\/$/, '');
      es = new EventSource(`${base}/hosts/${encodeURIComponent(user.id)}/stream`);
      es.addEventListener('live_comment', (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as {
            roomId?: string;
            comment?: {
              id: string;
              userId: string;
              userName: string;
              text: string;
              createdAt: number;
              kind?: LiveComment['kind'];
            };
          };
          if (!data.comment) return;
          if (data.roomId && data.roomId !== activeRoomId) return;
          setComments((prev) => {
            if (prev.some((c) => c.id === data.comment!.id)) return prev;
            return [
              ...prev,
              {
                id: data.comment!.id,
                userId: data.comment!.userId,
                userName: data.comment!.userName,
                text: data.comment!.text,
                createdAt: data.comment!.createdAt,
                kind: data.comment!.kind || 'comment',
              },
            ].slice(-80);
          });
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* poll / ws only */
    }
    return () => es?.close();
  }, [activeRoomId, user.id]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    void import('../services/realtimeWs').then(({ subscribeRealtime }) => {
      unsub = subscribeRealtime((event) => {
        if (event.type === 'live:ended') {
          const p = event.payload as { id?: string; hostId?: string };
          setLiveRooms((list) =>
            list.filter((r) => r.id !== p?.id && r.hostId !== p?.hostId),
          );
          return;
        }
        if (event.type === 'live:room') {
          const p = event.payload as LiveRoom;
          if (p?.isLive && p.hostId) {
            setLiveRooms((list) => {
              const rest = list.filter((r) => r.hostId !== p.hostId);
              return [p, ...rest];
            });
          }
          return;
        }
        if (event.type === 'live:comment') {
          const p = event.payload as {
            roomId?: string;
            comment?: {
              id: string;
              userId: string;
              userName: string;
              text: string;
              createdAt: number;
              kind?: LiveComment['kind'];
            };
          };
          if (!p.comment) return;
          if (p.roomId && activeRoomId && p.roomId !== activeRoomId) return;
          setComments((prev) => {
            if (prev.some((c) => c.id === p.comment!.id)) return prev;
            return [
              ...prev,
              {
                id: p.comment!.id,
                userId: p.comment!.userId,
                userName: p.comment!.userName,
                text: p.comment!.text,
                createdAt: p.comment!.createdAt,
                kind: p.comment!.kind || 'comment',
              },
            ].slice(-80);
          });
          return;
        }
        if (event.type === 'gift:received') {
          const p = event.payload as {
            toHostId?: string;
            roomId?: string;
            fromName?: string;
            giftName?: string;
            giftEmoji?: string;
            giftId?: string;
            coins?: number;
            createdAt?: number;
          };
          if (p.toHostId && p.toHostId !== user.id) return;
          if (p.roomId && activeRoomId && p.roomId !== activeRoomId) return;
          const overlay: LiveGiftEvent = {
            id: `ws_${Date.now()}`,
            fromId: String((event.payload as { fromUserId?: string }).fromUserId || 'fan'),
            fromName: p.fromName || 'Fan',
            fromAvatar: '',
            giftId: p.giftId || 'rose',
            giftName: p.giftName || 'Gift',
            giftEmoji: p.giftEmoji || '🎁',
            coins: Number(p.coins) || 0,
            combo: 1,
            createdAt: p.createdAt || Date.now(),
          };
          setGifts((prev) => [overlay, ...prev].slice(0, 50));
          enqueueGiftOverlay(overlay);
          const coins = Number(p.coins) || 0;
          if (coins > 0) {
            setTodayLiveGiftCoins((c) => c + coins);
          }
          return;
        }
        if (event.type !== 'recharge:updated') return;
        const p = event.payload as {
          users?: RechargeUserRow[];
          event?: {
            userId?: string;
            userName?: string;
            coins?: number;
            totalCoins?: number;
            roomId?: string;
          };
        };
        if (p?.users) setRechargeUsers(p.users);
        const ev = p?.event;
        if (!ev?.coins) return;
        setRechargeTicker({
          userId: ev.userId,
          userName: ev.userName || 'Viewer',
          coins: Number(ev.coins) || 0,
        });
        setTimeout(() => setRechargeTicker(null), 3200);
        notify(
          'User recharge',
          `ID ${ev.userId} · +${ev.coins} (total ${ev.totalCoins || ev.coins})`,
        );
        if (activeRoomId && (!ev.roomId || ev.roomId === activeRoomId)) {
          void postRoomComment(activeRoomId, {
            userId: ev.userId || 'viewer',
            userName: ev.userName || 'Viewer',
            text: `ID ${ev.userId} · +${ev.coins} coins (total ${ev.totalCoins || ev.coins}) 💎`,
            createdAt: Date.now(),
            kind: 'recharge',
            rechargeCoins: Number(ev.coins) || 0,
          });
        }
      });
    });
    return () => unsub?.();
  }, [activeRoomId, user.id]);

  useEffect(() => {
    if (!myLiveRoom?.isLive) {
      setSessionLiveSeconds(0);
      return;
    }
    const start = Number(myLiveRoom.startedAt || Date.now());
    const tick = () =>
      setSessionLiveSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [myLiveRoom?.isLive, myLiveRoom?.startedAt]);

  // Keep live-gift tile in sync with today's hydrated gift coins
  useEffect(() => {
    setTodayLiveGiftCoins((c) => Math.max(c, hostEarnings.gift || 0));
  }, [hostEarnings.gift]);

  const liveSeconds = todayLiveSeconds + sessionLiveSeconds;

  /** Keep API live room + presence fresh so Luma can join the Agora channel */
  useEffect(() => {
    if (!myLiveRoom?.isLive || !myLiveRoom.id) return;
    const roomSnapshot = myLiveRoom;
    const beat = () => {
      void publishLiveRoom({
        ...roomSnapshot,
        viewers: Math.max(1, roomSnapshot.viewers || 1),
        isLive: true,
      });
      void publishHostPresence({
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl || user.photoUrl,
        photoUrl: user.photoUrl || user.avatarUrl,
        country: user.country,
        ratePerMinute: 60,
        isOnline: true,
        isLive: true,
        isOnCall: false,
        workspaceMode: 'waiting_1v1',
      }).catch(() => undefined);
    };
    beat();
    const t = setInterval(beat, 12_000);
    return () => clearInterval(t);
  }, [
    myLiveRoom?.id,
    myLiveRoom?.isLive,
    myLiveRoom?.channel,
    user.avatarUrl,
    user.country,
    user.id,
    user.name,
  ]);

  const startSoloLive = useCallback(async () => {
    const id = `live_${user.id}`;
    let publicAvatar = user.avatarUrl || user.photoUrl || '';
    try {
      const { ensurePublicAvatarUrl } = await import('../services/mediaUploadService');
      const { isPublicHttpAvatar } = await import('../utils/hostAvatar');
      if (publicAvatar && !isPublicHttpAvatar(publicAvatar)) {
        const uploaded = await ensurePublicAvatarUrl(user.id, publicAvatar);
        if (uploaded) publicAvatar = uploaded;
      }
    } catch {
      /* keep local — API may convert data: on receive */
    }
    const entryFee = goLiveDraft.entryLocked
      ? Math.max(10, Math.min(9999, Math.floor(goLiveDraft.entryFee) || 50))
      : 0;
    const room: LiveRoom = {
      id,
      hostId: user.id,
      hostName: user.name,
      hostAvatar: publicAvatar,
      title: goLiveDraft.title.trim() || `${user.name}'s Live`,
      category: goLiveDraft.category,
      language: goLiveDraft.language,
      thumbnailUrl: goLiveDraft.thumbnailUrl || publicAvatar,
      channel: `live_${user.id}`,
      viewers: 1,
      likes: 0,
      giftCoins: 0,
      isLive: true,
      mode: 'solo',
      announcement: 'Welcome to my live! Be kind ✨',
      level: user.level,
      badge: user.isVerified ? 'Verified Host' : 'Host',
      startedAt: Date.now(),
      entryLocked: entryFee > 0,
      entryFee,
    };
    await publishLiveRoom(room);
    setMyLiveRoom(room);
    setActiveRoomId(room.id);
    setLiveRooms((list) => {
      const rest = list.filter((r) => r.id !== room.id && r.hostId !== user.id);
      return [room, ...rest];
    });
    setHostOnline(true, { silent: true });
    await syncHostPresence(user.id, {
      isOnline: true,
      isLive: true,
      isOnCall: false,
      name: user.name,
      avatarUrl: publicAvatar,
    });
    setBridgeLive(true);
    await publishHostPresence({
      id: user.id,
      name: user.name,
      avatarUrl: publicAvatar,
      photoUrl: publicAvatar,
      country: user.country,
      ratePerMinute: 80,
      isOnline: true,
      isLive: true,
      isOnCall: false,
      workspaceMode: 'waiting_1v1',
    }).catch(() => undefined);
    try {
      await postRoomComment(room.id, {
        userId: 'system',
        userName: 'System',
        text: `${user.name} started the live`,
        createdAt: Date.now(),
        kind: 'system',
      });
    } catch {
      /* optional */
    }
    notify(
      'You are Live',
      entryFee > 0
        ? `Room locked · ${entryFee} coins to enter`
        : 'Luma users can join your stream now.',
    );
    return room;
  }, [
    goLiveDraft.category,
    goLiveDraft.language,
    goLiveDraft.thumbnailUrl,
    goLiveDraft.title,
    goLiveDraft.entryFee,
    goLiveDraft.entryLocked,
    setHostOnline,
    user.avatarUrl,
    user.country,
    user.id,
    user.isVerified,
    user.level,
    user.name,
    user.photoUrl,
  ]);

  const startPartyLive = useCallback(async () => {
    const seats = emptySeats();
    seats[0] = {
      ...seats[0],
      hostId: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      micOn: true,
      camOn: true,
    };
    const id = `party_${user.id}`;
    const room: LiveRoom = {
      id,
      hostId: user.id,
      hostName: user.name,
      hostAvatar: user.avatarUrl,
      title: goLiveDraft.title.trim() || `${user.name}'s Party`,
      category: goLiveDraft.category,
      language: goLiveDraft.language,
      thumbnailUrl: goLiveDraft.thumbnailUrl || user.avatarUrl,
      channel: `party_${user.id}`,
      viewers: 1,
      likes: 0,
      giftCoins: 0,
      isLive: true,
      mode: 'party',
      announcement: 'Party room open — chat with host & friends ✨',
      level: user.level,
      badge: 'Party Host',
      startedAt: Date.now(),
      seats,
    };
    await publishLiveRoom(room);
    setMyLiveRoom(room);
    setActiveRoomId(room.id);
    setLiveRooms((list) => {
      const rest = list.filter((r) => r.id !== room.id && r.hostId !== user.id);
      return [room, ...rest];
    });
    setHostOnline(true, { silent: true });
    await syncHostPresence(user.id, {
      isOnline: true,
      isLive: true,
      isOnCall: false,
      name: user.name,
      avatarUrl: user.avatarUrl,
    });
    setBridgeLive(true);
    void publishHostPresence({
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl || user.photoUrl,
      photoUrl: user.photoUrl || user.avatarUrl,
      country: user.country,
      ratePerMinute: 60,
      isOnline: true,
      isLive: true,
      isOnCall: false,
      workspaceMode: 'waiting_1v1',
    });
    await postRoomComment(room.id, {
      userId: 'system',
      userName: 'System',
      text: `${user.name} opened the party room`,
      createdAt: Date.now(),
      kind: 'system',
    });
    notify('Party LIVE', 'Viewers can gift you and request a private call');
    return room;
  }, [goLiveDraft, setHostOnline, user]);

  const stopLive = useCallback(async () => {
    const endingId = myLiveRoom?.id;
    const endingHostId = user.id;
    // Remove from local list immediately so Discover clears the card
    if (endingId || endingHostId) {
      setLiveRooms((list) =>
        list.filter(
          (r) =>
            r.id !== endingId &&
            r.hostId !== endingHostId &&
            r.isLive !== false,
        ),
      );
    }
    setMyLiveRoom(null);
    setActiveRoomId(null);
    setBridgeLive(false);
    setSessionLiveSeconds(0);
    setLivePausedForCall(false);

    if (myLiveRoom) {
      const startedAt = Number(myLiveRoom.startedAt || Date.now());
      const sessionSec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      await endLiveRoom(myLiveRoom.id, user.id);
      await postRoomComment(myLiveRoom.id, {
        userId: 'system',
        userName: 'System',
        text: 'Live ended',
        createdAt: Date.now(),
        kind: 'system',
      }).catch(() => undefined);
      bumpTodayLiveSeconds(sessionSec);
      void refreshTodayStats();
    }
    await syncHostPresence(user.id, {
      isLive: false,
      isOnCall: false,
    });
    void publishHostPresence({
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl || user.photoUrl,
      photoUrl: user.photoUrl || user.avatarUrl,
      country: user.country,
      ratePerMinute: 80,
      isOnline: true,
      isLive: false,
      isOnCall: false,
      workspaceMode: 'waiting_1v1',
    }).catch(() => undefined);
    notify('Live ended', 'Thanks for streaming!');
  }, [bumpTodayLiveSeconds, myLiveRoom, refreshTodayStats, user]);

  /**
   * Keep live room listed & presence isLive=true, free Agora engine for 1v1.
   * Does NOT call endLiveRoom — Discover still shows the host as LIVE.
   */
  const pauseLiveForPrivateCall = useCallback(async () => {
    if (!myLiveRoom?.isLive) return;
    setLivePausedForCall(true);
    setBridgeLive(true);
    try {
      const { stopAgoraCall } = await import('../services/agoraService');
      await stopAgoraCall();
    } catch {
      /* engine may already be free */
    }
    await postRoomComment(myLiveRoom.id, {
      userId: 'system',
      userName: 'System',
      text: 'Host joined a private video call — live continues',
      createdAt: Date.now(),
      kind: 'system',
    }).catch(() => undefined);
    void publishHostPresence({
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl || user.photoUrl,
      photoUrl: user.photoUrl || user.avatarUrl,
      country: user.country,
      ratePerMinute: 80,
      isOnline: true,
      isLive: true,
      isOnCall: true,
      workspaceMode: 'solo_calling',
    }).catch(() => undefined);
  }, [myLiveRoom, user]);

  const resumeLiveAfterCall = useCallback(async () => {
    if (!myLiveRoom?.isLive) {
      setLivePausedForCall(false);
      return null;
    }
    setLivePausedForCall(false);
    setActiveRoomId(myLiveRoom.id);
    setBridgeLive(true);
    void publishHostPresence({
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl || user.photoUrl,
      photoUrl: user.photoUrl || user.avatarUrl,
      country: user.country,
      ratePerMinute: 80,
      isOnline: true,
      isLive: true,
      isOnCall: false,
      workspaceMode: 'waiting_1v1',
    }).catch(() => undefined);
    await postRoomComment(myLiveRoom.id, {
      userId: 'system',
      userName: 'System',
      text: 'Host is back on live',
      createdAt: Date.now(),
      kind: 'system',
    }).catch(() => undefined);
    return { roomId: myLiveRoom.id, channel: myLiveRoom.channel };
  }, [myLiveRoom, user]);

  const openRoom = useCallback((roomId: string) => setActiveRoomId(roomId), []);
  const closeRoomView = useCallback(() => {
    if (!myLiveRoom?.isLive) setActiveRoomId(null);
  }, [myLiveRoom?.isLive]);

  const sendComment = useCallback(
    async (text: string) => {
      if (!activeRoomId || !text.trim()) return;
      if (mutedUserIds.includes(user.id)) {
        notify('Muted', 'You cannot comment right now.');
        return;
      }
      await postRoomComment(activeRoomId, {
        userId: user.id,
        userName: user.name,
        text: text.trim(),
        createdAt: Date.now(),
        kind: 'comment',
      });
    },
    [activeRoomId, mutedUserIds, user.id, user.name],
  );

  const sendImageComment = useCallback(
    async (imageUrl: string, caption = '') => {
      if (!activeRoomId || !imageUrl) return;
      if (mutedUserIds.includes(user.id)) {
        notify('Muted', 'You cannot comment right now.');
        return;
      }
      await postRoomComment(activeRoomId, {
        userId: user.id,
        userName: user.name,
        text: caption.trim() || '📷 Photo',
        imageUrl,
        createdAt: Date.now(),
        kind: 'image',
      });
    },
    [activeRoomId, mutedUserIds, user.id, user.name],
  );

  const sendGift = useCallback(
    async (giftId: string) => {
      if (!activeRoomId) return;
      const gift = GIFT_CATALOG.find((g) => g.id === giftId);
      if (!gift) return;
      const last = gifts[0];
      const combo =
        last &&
        last.fromId === user.id &&
        last.giftId === gift.id &&
        Date.now() - last.createdAt < 3500
          ? (last.combo || 1) + 1
          : 1;
      const event: Omit<LiveGiftEvent, 'id'> = {
        fromId: user.id,
        fromName: user.name,
        fromAvatar: user.avatarUrl,
        giftId: gift.id,
        giftName: gift.name,
        giftEmoji: gift.emoji,
        coins: gift.coins,
        combo,
        createdAt: Date.now(),
      };
      await sendRoomGift(activeRoomId, event);
      const total = gift.coins * combo;
      setTodayLiveGiftCoins((c) => c + gift.coins);
      if (myLiveRoom && myLiveRoom.id === activeRoomId) {
        setMyLiveRoom((r) => (r ? { ...r, giftCoins: r.giftCoins + gift.coins } : r));
      }
      // Unlock locked photos when gift meets threshold
      if (gift.unlocksPhotos || gift.coins >= PHOTO_UNLOCK_MIN_COINS) {
        const locked = lockedPhotos.filter((p) => !p.unlockedBy?.[user.id]);
        for (const photo of locked) {
          if (gift.coins >= (photo.unlockCoins || PHOTO_UNLOCK_MIN_COINS)) {
            await unlockLivePhoto(activeRoomId, photo.id, user.id);
          }
        }
        if (locked.length) {
          notify('Photo unlocked', 'Gift opened locked images in this room');
        }
      }
      void import('../services/notificationInboxService').then(({ pushHostNotification }) =>
        pushHostNotification(myLiveRoom?.hostId || user.id, {
          type: 'gift',
          title: 'Gift received',
          body: `${user.name} sent ${gift.name}${combo > 1 ? ` x${combo}` : ''} (${gift.coins})`,
        }),
      );
      if (combo > 1) {
        notify('Combo!', `${gift.name} x${combo} · ${total} coins`);
      }
    },
    [activeRoomId, gifts, lockedPhotos, myLiveRoom, user],
  );

  const likeRoom = useCallback(() => {
    if (!activeRoomId) return;
    setLiveRooms((list) =>
      list.map((r) => (r.id === activeRoomId ? { ...r, likes: r.likes + 1 } : r)),
    );
    if (myLiveRoom?.id === activeRoomId) {
      setMyLiveRoom((r) => (r ? { ...r, likes: r.likes + 1 } : r));
    }
  }, [activeRoomId, myLiveRoom?.id]);

  const setAnnouncement = useCallback(
    async (text: string) => {
      if (!myLiveRoom) return;
      await pinAnnouncement(myLiveRoom.id, text);
      setMyLiveRoom((r) => (r ? { ...r, announcement: text } : r));
    },
    [myLiveRoom],
  );

  const renameRoom = useCallback(
    async (title: string) => {
      if (!myLiveRoom) return;
      const next = title.trim().slice(0, 48);
      if (!next) return;
      await updateRoomTitle(myLiveRoom.id, next);
      setMyLiveRoom((r) => (r ? { ...r, title: next } : r));
      setLiveRooms((list) =>
        list.map((r) => (r.id === myLiveRoom.id ? { ...r, title: next } : r)),
      );
      notify('Room renamed', next);
    },
    [myLiveRoom],
  );

  const updateSeats = useCallback(
    async (seats: PartySeatPublic[]) => {
      if (!myLiveRoom) return;
      await updatePartySeats(myLiveRoom.id, seats);
      setMyLiveRoom((r) => (r ? { ...r, seats } : r));
    },
    [myLiveRoom],
  );

  const massTextAllActive = useCallback(
    async (text: string) => {
      const sent = await massTextAllActiveUsers({
        hostId: user.id,
        hostName: user.name,
        text,
      });
      notify('Mass text sent', `Delivered to ${sent} active users`);
      return sent;
    },
    [user.id, user.name],
  );

  const contactAdminSupport = useCallback(
    async (text: string) => {
      const ticket = await createAdminSupportTicket({
        hostId: user.id,
        hostName: user.name,
        text,
      });
      notify('Admin support', `Ticket ${ticket.id} created`);
    },
    [user.id, user.name],
  );

  const addGiftLockedPhoto = useCallback(
    async (url: string, caption = '', unlockCoins = PHOTO_UNLOCK_MIN_COINS) => {
      if (!myLiveRoom) {
        notify('Go live first', 'Start a room to add locked photos');
        return;
      }
      await addLockedPhoto(myLiveRoom.id, {
        url,
        caption: caption || 'Exclusive photo',
        unlockCoins,
        createdAt: Date.now(),
      });
      notify('Locked photo added', `Unlocks with gift ≥ ${unlockCoins} coins`);
    },
    [myLiveRoom],
  );

  const unlockPhotoWithGift = useCallback(
    async (photoId: string) => {
      if (!activeRoomId) return;
      await unlockLivePhoto(activeRoomId, photoId, user.id);
      notify('Unlocked', 'Photo is open for you');
    },
    [activeRoomId, user.id],
  );

  const simulateViewerRecharge = useCallback(async () => {
    if (!activeRoomId) return;
    const coins = [100, 500, 1380, 5000, 13800][Math.floor(Math.random() * 5)];
    const names = ['Aya', 'Noor', 'Omar', 'Sara', 'Leo', 'Mia'];
    const userName = names[Math.floor(Math.random() * names.length)];
    const userId = `u_${userName.toLowerCase()}_${Math.floor(Math.random() * 9000 + 1000)}`;
    await reportRoomRecharge({
      roomId: activeRoomId,
      userId,
      userName,
      coins,
    });
  }, [activeRoomId]);

  const muteUser = useCallback((userId: string) => {
    setMutedUserIds((ids) => (ids.includes(userId) ? ids : [...ids, userId]));
    notify('Muted', 'User muted in this room.');
  }, []);

  const kickUser = useCallback((userId: string) => {
    notify('Kicked', `User ${userId.slice(0, 6)} removed from chat.`);
  }, []);

  const blockUserInRoom = useCallback((userId: string) => {
    setBlockedInRoom((ids) => (ids.includes(userId) ? ids : [...ids, userId]));
    notify('Blocked', 'User blocked from your live.');
  }, []);

  const updateRoomLock = useCallback(
    async (opts: { entryLocked: boolean; entryFee: number }) => {
      if (!myLiveRoom) return;
      await updateLiveRoomLock(myLiveRoom.id, user.id, opts);
      setMyLiveRoom((r) =>
        r ? { ...r, entryLocked: opts.entryLocked, entryFee: opts.entryLocked ? opts.entryFee : 0 } : r,
      );
      setLiveRooms((list) =>
        list.map((r) =>
          r.id === myLiveRoom.id
            ? { ...r, entryLocked: opts.entryLocked, entryFee: opts.entryLocked ? opts.entryFee : 0 }
            : r,
        ),
      );
    },
    [myLiveRoom, user.id],
  );

  const monthlyEarn = useMemo(() => {
    const fromApi = hostLifetime?.monthlyCoins;
    if (typeof fromApi === 'number' && fromApi > 0) return fromApi;
    return (
      (hostEarnings?.call || 0) +
      (hostEarnings?.gift || 0) +
      (hostEarnings?.task || 0) +
      (hostEarnings?.invite || 0) +
      todayLiveGiftCoins
    );
  }, [hostEarnings, hostLifetime?.monthlyCoins, todayLiveGiftCoins]);

  const value = useMemo(
    () => ({
      liveRooms,
      myLiveRoom,
      activeRoomId,
      comments,
      gifts,
      giftOverlay,
      lockedPhotos,
      rechargeTicker,
      rechargeUsers,
      goLiveDraft,
      setGoLiveDraft,
      startSoloLive,
      startPartyLive,
      stopLive,
      pauseLiveForPrivateCall,
      resumeLiveAfterCall,
      livePausedForCall,
      openRoom,
      closeRoomView,
      sendComment,
      sendImageComment,
      sendGift,
      likeRoom,
      setAnnouncement,
      renameRoom,
      updateSeats,
      massTextAllActive,
      contactAdminSupport,
      addGiftLockedPhoto,
      unlockPhotoWithGift,
      simulateViewerRecharge,
      muteUser,
      kickUser,
      blockUserInRoom,
      updateRoomLock,
      mutedUserIds,
      blockedInRoom,
      liveSeconds,
      todayLiveGiftCoins,
      monthlyEarn,
    }),
    [
      liveRooms,
      myLiveRoom,
      activeRoomId,
      comments,
      gifts,
      giftOverlay,
      lockedPhotos,
      rechargeTicker,
      rechargeUsers,
      goLiveDraft,
      setGoLiveDraft,
      startSoloLive,
      startPartyLive,
      stopLive,
      pauseLiveForPrivateCall,
      resumeLiveAfterCall,
      livePausedForCall,
      openRoom,
      closeRoomView,
      sendComment,
      sendImageComment,
      sendGift,
      likeRoom,
      setAnnouncement,
      renameRoom,
      updateSeats,
      massTextAllActive,
      contactAdminSupport,
      addGiftLockedPhoto,
      unlockPhotoWithGift,
      simulateViewerRecharge,
      muteUser,
      kickUser,
      blockUserInRoom,
      updateRoomLock,
      mutedUserIds,
      blockedInRoom,
      liveSeconds,
      todayLiveGiftCoins,
      monthlyEarn,
    ],
  );

  return (
    <LiveStudioContext.Provider value={value}>{children}</LiveStudioContext.Provider>
  );
}

export function useLiveStudio() {
  const ctx = useContext(LiveStudioContext);
  if (!ctx) throw new Error('useLiveStudio must be used within LiveStudioProvider');
  return ctx;
}
