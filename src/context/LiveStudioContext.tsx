import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  const { user, setHostOnline } = useApp();
  const [liveRooms, setLiveRooms] = useState<LiveRoom[]>([]);
  const [myLiveRoom, setMyLiveRoom] = useState<LiveRoom | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [gifts, setGifts] = useState<LiveGiftEvent[]>([]);
  const [giftOverlay, setGiftOverlay] = useState<LiveGiftEvent | null>(null);
  const [lockedPhotos, setLockedPhotos] = useState<LockedLivePhoto[]>([]);
  const [rechargeTicker, setRechargeTicker] = useState<{
    userName: string;
    coins: number;
    userId?: string;
  } | null>(null);
  const [rechargeUsers, setRechargeUsers] = useState<RechargeUserRow[]>([]);
  const [mutedUserIds, setMutedUserIds] = useState<string[]>([]);
  const [blockedInRoom, setBlockedInRoom] = useState<string[]>([]);
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [todayLiveGiftCoins, setTodayLiveGiftCoins] = useState(0);
  const [goLiveDraft, setDraft] = useState<GoLiveDraft>({
    title: `${user.name}'s Live`,
    category: 'Beauty',
    language: 'English',
    thumbnailUrl: user.avatarUrl,
    beautyOn: true,
    facing: 'user',
  });

  const setGoLiveDraft = useCallback((patch: Partial<GoLiveDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  useEffect(() => listenLiveRooms(setLiveRooms), []);

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
        setGiftOverlay(items[0]);
        setTimeout(() => setGiftOverlay(null), 2800);
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
          const overlay = {
            id: `ws_${Date.now()}`,
            fromUserId: String((event.payload as { fromUserId?: string }).fromUserId || 'fan'),
            fromName: p.fromName || 'Fan',
            giftId: p.giftId || 'rose',
            giftName: p.giftName || 'Gift',
            giftEmoji: p.giftEmoji || '🎁',
            coins: Number(p.coins) || 0,
            combo: 1,
            createdAt: p.createdAt || Date.now(),
          };
          setGifts((prev) => [overlay, ...prev].slice(0, 50));
          setGiftOverlay(overlay);
          setTimeout(() => setGiftOverlay(null), 2800);
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
      setLiveSeconds(0);
      return;
    }
    const t = setInterval(() => setLiveSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [myLiveRoom?.isLive]);

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
    const room: LiveRoom = {
      id,
      hostId: user.id,
      hostName: user.name,
      hostAvatar: user.avatarUrl,
      title: goLiveDraft.title.trim() || `${user.name}'s Live`,
      category: goLiveDraft.category,
      language: goLiveDraft.language,
      thumbnailUrl: goLiveDraft.thumbnailUrl || user.avatarUrl,
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
    await publishHostPresence({
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
    await postRoomComment(room.id, {
      userId: 'system',
      userName: 'System',
      text: `${user.name} started the live`,
      createdAt: Date.now(),
      kind: 'system',
    });
    notify('You are LIVE', 'Your room is now visible in Live.');
    return room;
  }, [goLiveDraft, setHostOnline, user]);

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
    if (myLiveRoom) {
      await endLiveRoom(myLiveRoom.id, user.id);
      await postRoomComment(myLiveRoom.id, {
        userId: 'system',
        userName: 'System',
        text: 'Live ended',
        createdAt: Date.now(),
        kind: 'system',
      });
    }
    setMyLiveRoom(null);
    setActiveRoomId(null);
    setBridgeLive(false);
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

  const monthlyEarn = useMemo(
    () => user.coinBalance + todayLiveGiftCoins,
    [todayLiveGiftCoins, user.coinBalance],
  );

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
