import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { GIFT_CATALOG } from '../data/gifts';
import { useApp } from '../context/AppContext';
import {
  endLiveRoom,
  listenLiveRooms,
  listenRoomComments,
  listenRoomGifts,
  pinAnnouncement,
  postRoomComment,
  publishLiveRoom,
  sendRoomGift,
  updatePartySeats,
  type LiveComment,
  type LiveGiftEvent,
  type LiveRoom,
  type PartySeatPublic,
} from '../services/liveRoomService';
import { syncHostPresence } from '../services/realtimeService';
import { publishHostPresence } from '../services/callBridge';
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
  goLiveDraft: GoLiveDraft;
  setGoLiveDraft: (patch: Partial<GoLiveDraft>) => void;
  startSoloLive: () => Promise<LiveRoom>;
  startPartyLive: () => Promise<LiveRoom>;
  stopLive: () => Promise<void>;
  openRoom: (roomId: string) => void;
  closeRoomView: () => void;
  sendComment: (text: string) => Promise<void>;
  sendGift: (giftId: string) => Promise<void>;
  likeRoom: () => void;
  setAnnouncement: (text: string) => Promise<void>;
  updateSeats: (seats: PartySeatPublic[]) => Promise<void>;
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

  useEffect(() => {
    if (!activeRoomId) {
      setComments([]);
      setGifts([]);
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
    return () => {
      u1();
      u2();
    };
  }, [activeRoomId]);

  useEffect(() => {
    if (!myLiveRoom?.isLive) {
      setLiveSeconds(0);
      return;
    }
    const t = setInterval(() => setLiveSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [myLiveRoom?.isLive]);

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
    setHostOnline(true, { silent: true });
    await syncHostPresence(user.id, {
      isOnline: true,
      isLive: true,
      isOnCall: false,
      name: user.name,
      avatarUrl: user.avatarUrl,
    });
    void publishHostPresence({
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      country: user.country,
      ratePerMinute: 60,
      isOnline: true,
      isLive: true,
      isOnCall: false,
    });
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
      announcement: 'Party room open — request a seat!',
      level: user.level,
      badge: 'Party Host',
      startedAt: Date.now(),
      seats,
    };
    await publishLiveRoom(room);
    setMyLiveRoom(room);
    setActiveRoomId(room.id);
    setHostOnline(true, { silent: true });
    await syncHostPresence(user.id, {
      isOnline: true,
      isLive: true,
      isOnCall: false,
      name: user.name,
      avatarUrl: user.avatarUrl,
    });
    void publishHostPresence({
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      country: user.country,
      ratePerMinute: 60,
      isOnline: true,
      isLive: true,
      isOnCall: false,
    });
    notify('Party LIVE', 'Multi-host party room is live.');
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
    await syncHostPresence(user.id, {
      isLive: false,
      isOnCall: false,
    });
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
    [activeRoomId, gifts, myLiveRoom, user],
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

  const updateSeats = useCallback(
    async (seats: PartySeatPublic[]) => {
      if (!myLiveRoom) return;
      await updatePartySeats(myLiveRoom.id, seats);
      setMyLiveRoom((r) => (r ? { ...r, seats } : r));
    },
    [myLiveRoom],
  );

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
      goLiveDraft,
      setGoLiveDraft,
      startSoloLive,
      startPartyLive,
      stopLive,
      openRoom,
      closeRoomView,
      sendComment,
      sendGift,
      likeRoom,
      setAnnouncement,
      updateSeats,
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
      goLiveDraft,
      setGoLiveDraft,
      startSoloLive,
      startPartyLive,
      stopLive,
      openRoom,
      closeRoomView,
      sendComment,
      sendGift,
      likeRoom,
      setAnnouncement,
      updateSeats,
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
