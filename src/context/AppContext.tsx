import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { COIN_PACKAGES, MOCK_NEWS, MOCK_ROOMS } from '../data/mockData';
import {
  type BridgeCall,
  fetchBridgeHosts,
  listenIncomingCalls,
  publishHostPresence,
} from '../services/callBridge';
import {
  getBridgeLive,
  getBridgeWorkspaceMode,
  setBridgeWorkspaceMode,
} from '../services/hostBridgeState';
import { listenHostControl, syncHostPresence } from '../services/realtimeService';
import type {
  CallSession,
  CoinPackage,
  Host,
  NewsItem,
  PartyRoom,
  Transaction,
  User,
} from '../types/models';
import type {
  HostPresenceStatus,
  HostWorkspaceMode,
  PartySeat,
} from '../types/hostWorkspace';
import { notify } from '../utils/notify';

type HomeFilter = 'working' | 'live' | 'online' | 'prime';
type HomeTab = 'list' | 'match' | 'live' | 'circle';
type NewsTab = 'flame' | 'prime' | 'stranger';
type PartyTab = 'party' | 'follow' | 'recent';
export type HostToolKey =
  | 'guide'
  | 'hi'
  | 'live'
  | 'match'
  | 'task'
  | 'beauty'
  | 'points'
  | 'gift'
  | 'profile'
  | 'invite'
  | 'props'
  | 'livedata'
  | 'party';

export type CompetitionEntry = {
  id: string;
  name: string;
  avatarUrl: string;
  todayMinutes: number;
  longestCallSeconds: number;
  todayCoins: number;
  isLive: boolean;
  isOnCall: boolean;
  isMe: boolean;
  rank: number;
};

type AppContextValue = {
  user: User;
  updateUser: (patch: Partial<User>) => void;
  hosts: Host[];
  news: NewsItem[];
  rooms: PartyRoom[];
  packages: CoinPackage[];
  transactions: Transaction[];
  blockedIds: string[];
  call: CallSession | null;
  homeFilter: HomeFilter;
  setHomeFilter: (f: HomeFilter) => void;
  homeTab: HomeTab;
  setHomeTab: (t: HomeTab) => void;
  newsTab: NewsTab;
  setNewsTab: (t: NewsTab) => void;
  partyTab: PartyTab;
  setPartyTab: (t: PartyTab) => void;
  followedRoomIds: string[];
  joinedRoomId: string | null;
  myRoomId: string | null;
  myRoom: PartyRoom | null;
  partyLiveSeconds: number;
  hostOnline: boolean;
  setHostOnline: (v: boolean, opts?: { silent?: boolean }) => void;
  hostEarnings: {
    call: number;
    gift: number;
    task: number;
    invite: number;
    managed: number;
  };
  /** Lifetime + month aggregates from earnings API */
  hostLifetime: {
    totalGifts: number;
    coinsEarned: number;
    walletBalance: number;
    totalCalls: number;
    followers: number;
    liveSeconds: number;
    liveSessions: number;
    monthlyCoins: number;
  };
  callsToday: number;
  beautyOn: boolean;
  points: number;
  /** Your call minutes today (competition) */
  myTodayMinutes: number;
  /** Accumulated live streaming seconds today (survives refresh via API) */
  todayLiveSeconds: number;
  /** Your longest call today in seconds */
  myLongestCallSeconds: number;
  competition: CompetitionEntry[];
  myRank: number;
  liveHosts: Host[];
  workingHosts: Host[];
  buyCoins: (packageId: string) => boolean;
  startCall: (hostId: string) => { ok: boolean; message?: string };
  endCall: () => void;
  blockUser: (hostId: string) => void;
  reportUser: (hostId: string, reason: string) => void;
  markNewsRead: (id: string) => void;
  clearNewsCategory: (category: NewsTab) => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
  followRoom: (roomId: string) => void;
  createMyRoom: () => void;
  startPartyLive: () => void;
  endPartyLive: () => void;
  requestPayout: () => void;
  applyPayout: (
    amount: number,
    gateway: string,
    withdrawalId: string,
    nextBalance: number,
  ) => void;
  /** Re-fetch today's call/gift/live stats from API */
  refreshTodayStats: () => Promise<void>;
  /** Add seconds to today's completed live time (e.g. after ending a stream) */
  bumpTodayLiveSeconds: (seconds: number) => void;
  runHostTool: (key: HostToolKey) => void;
  refreshList: () => void;
  getHost: (id: string) => Host | undefined;
  filteredHosts: Host[];
  filteredNews: NewsItem[];
  filteredRooms: PartyRoom[];
  unreadNewsCount: number;
  /** Incoming call from Luma / user app */
  incomingBridgeCall: BridgeCall | null;
  clearIncomingBridgeCall: () => void;
  /** Persistent host workspace / presence */
  workspaceMode: HostWorkspaceMode;
  setWorkspaceMode: (mode: HostWorkspaceMode) => void;
  hostPresenceStatus: HostPresenceStatus;
  partySeats: PartySeat[];
  partyGroupGiftsToday: number;
  joinPartySeat: (seatIndex: number) => void;
  leavePartySeat: () => void;
  enterPartyRoom: () => void;
  /** Bridge (Luma) call ledger — keeps Today's earnings live */
  registerBridgeCallStart: () => void;
  creditBridgeMinute: (amount: number) => void;
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

const defaultUser: User = {
  id: '',
  name: '',
  role: 'host',
  coinBalance: 0,
  diamonds: 0,
  gems: 0,
  level: 1,
  isVerified: false,
  avatarUrl: '',
  isOnline: false,
  hostStatus: 'none',
  hostId: undefined,
  country: undefined,
};

function addEarn(
  setUser: React.Dispatch<React.SetStateAction<User>>,
  setHostEarnings: React.Dispatch<
    React.SetStateAction<{
      call: number;
      gift: number;
      task: number;
      invite: number;
      managed: number;
    }>
  >,
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>,
  amount: number,
  bucket: 'call' | 'gift' | 'task' | 'invite' | 'managed',
  label: string,
) {
  setUser((u) => ({ ...u, coinBalance: u.coinBalance + amount }));
  setHostEarnings((e) => ({ ...e, [bucket]: e[bucket] + amount }));
  setTransactions((txs) => [
    {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'earn',
      amount,
      label,
      timestamp: Date.now(),
    },
    ...txs,
  ]);
}

export function AppProvider({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  initialUser?: Partial<User>;
}) {
  const [user, setUser] = useState<User>({
    ...defaultUser,
    ...initialUser,
    role: 'host',
    hostStatus: initialUser?.hostStatus || 'approved',
  });

  // Isolate identity: always mirror authenticated host profile (never stale demo)
  useEffect(() => {
    if (!initialUser?.id) return;
    const authId = initialUser.id;
    setUser((u) => ({
      ...u,
      id: authId,
      name: initialUser.name || u.name,
      avatarUrl: initialUser.avatarUrl || initialUser.photoUrl || u.avatarUrl,
      photoUrl: initialUser.photoUrl || initialUser.avatarUrl || u.photoUrl,
      hostId: initialUser.hostId || u.hostId,
      country: initialUser.country || u.country,
      hostStatus: initialUser.hostStatus || u.hostStatus,
      isVerified: initialUser.isVerified ?? u.isVerified,
      email: initialUser.email || u.email,
      phone: initialUser.phone || u.phone,
    }));
  }, [
    initialUser?.id,
    initialUser?.name,
    initialUser?.avatarUrl,
    initialUser?.photoUrl,
    initialUser?.hostId,
    initialUser?.country,
    initialUser?.hostStatus,
    initialUser?.isVerified,
    initialUser?.email,
    initialUser?.phone,
  ]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [news, setNews] = useState<NewsItem[]>(MOCK_NEWS);
  const [rooms, setRooms] = useState<PartyRoom[]>(MOCK_ROOMS);
  const [transactions, setTransactions] = useState<Transaction[]>([
    {
      id: 't0',
      type: 'earn',
      amount: 500,
      label: 'Welcome host bonus',
      timestamp: Date.now() - 86400000,
    },
  ]);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [call, setCall] = useState<CallSession | null>(null);
  const [homeFilter, setHomeFilter] = useState<HomeFilter>('working');
  const [homeTab, setHomeTab] = useState<HomeTab>('list');
  const [newsTab, setNewsTab] = useState<NewsTab>('flame');
  const [partyTab, setPartyTab] = useState<PartyTab>('party');
  const [followedRoomIds, setFollowedRoomIds] = useState<string[]>([]);
  const [joinedRoomId, setJoinedRoomId] = useState<string | null>(null);
  const [myRoomId, setMyRoomId] = useState<string | null>(null);
  const [partyLiveSeconds, setPartyLiveSeconds] = useState(0);
  const [hostOnline, setHostOnlineState] = useState(true);
  const [beautyOn, setBeautyOn] = useState(true);

  // Sync online hosts from API — offline hosts are never listed
  useEffect(() => {
    let cancelled = false;
    const mapBridge = (list: Awaited<ReturnType<typeof fetchBridgeHosts>>): Host[] =>
      list
        .filter((h) => h.isOnline || h.isLive)
        .map((h) => ({
          id: h.id,
          name: h.name,
          avatarUrl: h.avatarUrl || '',
          country: h.country || '',
          level: 1,
          isVip: false,
          isOnline: Boolean(h.isOnline),
          isLive: Boolean(h.isLive),
          isOnCall: Boolean(h.isOnCall),
          ratePerMinute: h.ratePerMinute || 80,
          rating: 4.8,
          bio: h.isLive ? 'Live now' : 'Online · ready for 1v1',
          photos: h.avatarUrl ? [h.avatarUrl] : [],
          totalCalls: 0,
          todayMinutes: 0,
          longestCallSeconds: 0,
          todayCoins: 0,
          currentCallSeconds: 0,
        }));

    const load = async () => {
      try {
        const list = await fetchBridgeHosts();
        if (!cancelled) setHosts(mapBridge(list));
      } catch {
        if (!cancelled) {
          setHosts((prev) => prev.filter((h) => h.isOnline || h.isLive));
        }
      }
    };
    void load();
    const timer = setInterval(() => void load(), 8_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const [points, setPoints] = useState(120);
  const [hostEarnings, setHostEarnings] = useState({
    call: 0,
    gift: 0,
    task: 0,
    invite: 0,
    managed: 0,
  });
  const [hostLifetime, setHostLifetime] = useState({
    totalGifts: 0,
    coinsEarned: 0,
    walletBalance: 0,
    totalCalls: 0,
    followers: 0,
    liveSeconds: 0,
    liveSessions: 0,
    monthlyCoins: 0,
  });
  const [callsToday, setCallsToday] = useState(0);
  const [myTodayMinutes, setMyTodayMinutes] = useState(0);
  const [todayLiveSeconds, setTodayLiveSeconds] = useState(0);
  const [myLongestCallSeconds, setMyLongestCallSeconds] = useState(0);
  const hydratedDayRef = useRef<number>(0);
  const [incomingBridgeCall, setIncomingBridgeCall] = useState<BridgeCall | null>(
    null,
  );
  const [workspaceMode, setWorkspaceModeState] =
    useState<HostWorkspaceMode>('waiting_1v1');
  const [partySeats, setPartySeats] = useState<PartySeat[]>(() =>
    Array.from({ length: 6 }, (_, index) => ({
      index,
      occupied: false,
      hostId: null,
      name: '',
      avatarUrl: '',
      isMe: false,
      isSpeaking: false,
      micOn: false,
    })),
  );
  const [partyGroupGiftsToday, setPartyGroupGiftsToday] = useState(1840);
  const callRef = useRef<CallSession | null>(null);

  const clearIncomingBridgeCall = useCallback(() => {
    setIncomingBridgeCall(null);
  }, []);

  const setWorkspaceMode = useCallback((mode: HostWorkspaceMode) => {
    setWorkspaceModeState(mode);
    setBridgeWorkspaceMode(mode === 'solo_calling' ? 'solo_calling' : 'waiting_1v1');
  }, []);

  useEffect(() => {
    setBridgeWorkspaceMode(
      workspaceMode === 'solo_calling' ? 'solo_calling' : 'waiting_1v1',
    );
  }, [workspaceMode]);

  const hostPresenceStatus: HostPresenceStatus = useMemo(() => {
    if (!hostOnline) return 'offline';
    if (call?.status === 'active' || workspaceMode === 'solo_calling') {
      return 'solo_calling';
    }
    return 'online';
  }, [call?.status, hostOnline, workspaceMode]);

  const enterPartyRoom = useCallback(() => {
    notify('Party Room removed', 'Use Go Live for streaming.');
    setWorkspaceModeState('waiting_1v1');
  }, []);

  const joinPartySeat = useCallback(
    (seatIndex: number) => {
      setWorkspaceModeState('waiting_1v1');
      setPartySeats((seats) => {
        const withoutMe = seats.map((s) =>
          s.isMe
            ? {
                ...s,
                occupied: false,
                hostId: null,
                name: '',
                avatarUrl: '',
                isMe: false,
                isSpeaking: false,
                micOn: false,
              }
            : s,
        );
        return withoutMe.map((s) =>
          s.index === seatIndex
            ? {
                ...s,
                occupied: true,
                hostId: user.id,
                name: user.name,
                avatarUrl: user.avatarUrl,
                isMe: true,
                isSpeaking: true,
                micOn: true,
              }
            : s,
        );
      });
    },
    [user.avatarUrl, user.id, user.name],
  );

  const leavePartySeat = useCallback(() => {
    setPartySeats((seats) =>
      seats.map((s) =>
        s.isMe
          ? {
              ...s,
              occupied: false,
              hostId: null,
              name: '',
              avatarUrl: '',
              isMe: false,
              isSpeaking: false,
              micOn: false,
            }
          : s,
      ),
    );
  }, []);

  // Auto flip to solo_calling when an active call exists
  useEffect(() => {
    if (call?.status === 'active') {
      setWorkspaceModeState('solo_calling');
    } else if (workspaceMode === 'solo_calling') {
      setWorkspaceModeState('waiting_1v1');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.status]);

  const setHostOnline = useCallback((v: boolean, opts?: { silent?: boolean }) => {
    setHostOnlineState(v);
    setUser((u) => ({ ...u, isOnline: v }));
    if (!v) {
      setWorkspaceModeState('waiting_1v1');
      setBridgeWorkspaceMode('waiting_1v1');
    }
    void syncHostPresence(user.id, { isOnline: v });
    // Always try production bridge — never skip when online
    void publishHostPresence({
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl || user.photoUrl,
      photoUrl: user.photoUrl || user.avatarUrl,
      country: user.country,
      ratePerMinute: 80,
      isOnline: v,
      isLive: getBridgeLive(),
      isOnCall: Boolean(callRef.current?.status === 'active'),
      workspaceMode: getBridgeWorkspaceMode(),
    })
      .then(() => {
        if (v && !opts?.silent) {
          notify(
            'Visible to Luma users',
            'You are listed on the user app for 1v1 calls.',
          );
        }
      })
      .catch((err: unknown) => {
        if (v && !opts?.silent) {
          const msg =
            err instanceof Error ? err.message : 'Could not reach CoinCall API';
          notify('Bridge offline', msg.slice(0, 120));
        }
      });
    if (!opts?.silent) {
      notify(
        v ? 'You are Online' : 'You are Offline',
        v
          ? 'Luma users can now call you. Earnings start when a call begins.'
          : 'You will not receive new calls until you go online again.',
      );
    }
  }, [user.avatarUrl, user.photoUrl, user.country, user.id, user.name]);

  // Heartbeat + SSE so Luma users can find & ring this host
  useEffect(() => {
    if (!hostOnline) return;

    const beat = () => {
      void publishHostPresence({
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl || user.photoUrl,
        photoUrl: user.photoUrl || user.avatarUrl,
        country: user.country,
        ratePerMinute: 80,
        isOnline: true,
        isLive: getBridgeLive(),
        isOnCall:
          Boolean(callRef.current?.status === 'active') ||
          Boolean(incomingBridgeCall),
        workspaceMode: getBridgeWorkspaceMode(),
      }).catch(() => undefined);
    };
    beat();
    // Frequent heartbeat so free-tier API wake + TTL stay fresh
    const timer = setInterval(beat, 8_000);
    const stopListen = listenIncomingCalls(user.id, (bridgeCall) => {
      if (bridgeCall.status !== 'ringing') return;
      setIncomingBridgeCall(bridgeCall);
      // No window.alert — IncomingCallModal handles ring UI
    });

    return () => {
      clearInterval(timer);
      stopListen();
    };
  }, [
    hostOnline,
    incomingBridgeCall,
    user.avatarUrl,
    user.photoUrl,
    user.country,
    user.id,
    user.name,
  ]);

  useEffect(() => {
    callRef.current = call;
  }, [call]);

  useEffect(() => {
    if (!call || call.status !== 'active') return;

    const peer = hosts.find((h) => h.id === call.hostId);
    if (!peer) return;

    const interval = setInterval(() => {
      setCall((prev) => {
        if (!prev || prev.status !== 'active') return prev;
        const nextSeconds = prev.seconds + 1;
        const shouldEarn = nextSeconds % 10 === 0;
        if (!shouldEarn) {
          return { ...prev, seconds: nextSeconds };
        }

        const tickEarn = Math.max(1, Math.round(peer.ratePerMinute / 6));
        setUser((u) => ({ ...u, coinBalance: u.coinBalance + tickEarn }));
        setHostEarnings((e) => ({ ...e, call: e.call + tickEarn }));
        setTransactions((txs) => [
          {
            id: `tx_${Date.now()}`,
            type: 'earn',
            amount: tickEarn,
            label: `Call earnings · ${peer.name}`,
            timestamp: Date.now(),
          },
          ...txs,
        ]);

        return {
          ...prev,
          seconds: nextSeconds,
          coinsSpent: prev.coinsSpent + tickEarn,
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [call?.status, call?.hostId, hosts]);

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((u) => ({ ...u, ...patch }));
  }, []);

  const getHost = useCallback((id: string) => hosts.find((h) => h.id === id), [hosts]);

  const buyCoins = useCallback((packageId: string) => {
    const pkg = COIN_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) return false;
    const total = pkg.coins + (pkg.bonus ?? 0);
    setUser((u) => ({ ...u, coinBalance: u.coinBalance + total }));
    setTransactions((txs) => [
      {
        id: `tx_${Date.now()}`,
        type: 'purchase',
        amount: total,
        label: `Bought ${pkg.coins} coins${pkg.bonus ? ` +${pkg.bonus} bonus` : ''}`,
        timestamp: Date.now(),
      },
      ...txs,
    ]);
    notify('Purchase successful', `+${total} coins added to your wallet.`);
    return true;
  }, []);

  const startCall = useCallback(
    (hostId: string) => {
      const peer = hosts.find((h) => h.id === hostId);
      if (!peer) return { ok: false, message: 'User not found.' };
      if (blockedIds.includes(hostId)) {
        return { ok: false, message: 'You blocked this user.' };
      }
      if (!peer.isOnline) {
        return { ok: false, message: 'User is offline.' };
      }
      if (!hostOnline) {
        return {
          ok: false,
          message: 'Go Online from the Calls tab before taking calls.',
        };
      }

      setUser((u) => ({ ...u, coinBalance: u.coinBalance + peer.ratePerMinute }));
      setHostEarnings((e) => ({ ...e, call: e.call + peer.ratePerMinute }));
      setCallsToday((n) => n + 1);
      setTransactions((txs) => [
        {
          id: `tx_${Date.now()}`,
          type: 'earn',
          amount: peer.ratePerMinute,
          label: `Call started · ${peer.name}`,
          timestamp: Date.now(),
        },
        ...txs,
      ]);
      setCall({
        hostId,
        startedAt: Date.now(),
        seconds: 0,
        coinsSpent: peer.ratePerMinute,
        status: 'active',
      });
      setWorkspaceModeState('solo_calling');
      return { ok: true };
    },
    [blockedIds, hostOnline, hosts],
  );

  const endCall = useCallback(() => {
    const active = callRef.current;
    const earned = active?.coinsSpent ?? 0;
    const secs = active?.seconds ?? 0;
    if (secs > 0) {
      setMyTodayMinutes((m) => m + Math.max(1, Math.round(secs / 60)));
      setMyLongestCallSeconds((best) => Math.max(best, secs));
    }
    setCall((c) => (c ? { ...c, status: 'ended' } : null));
    setTimeout(() => {
      setCall(null);
      setWorkspaceModeState('waiting_1v1');
    }, 300);
    const tip =
      secs >= 5 * 60
        ? 'Great long call! You climbed the competition'
        : 'Stay longer next time to beat other hosts';
    notify('Call ended', `You earned ${earned} coins. ${tip}`);

    if (earned > 0) {
      void import('../services/walletSyncService').then(({ creditHostEarnings, syncHostWalletBalance }) => {
        const next = user.coinBalance;
        void syncHostWalletBalance({
          hostId: user.id,
          coinBalance: next,
          displayName: user.name,
        });
        void creditHostEarnings({
          hostId: user.id,
          amount: earned,
          reason: 'call_end',
          displayName: user.name,
        }).catch(() => undefined);
      });
      void import('../services/notificationInboxService').then(({ pushHostNotification }) => {
        void pushHostNotification(user.id, {
          type: 'call',
          title: 'Call earnings',
          body: `You earned ${earned} coins from your last call.`,
        });
      });
    }
  }, [user.coinBalance, user.id, user.name]);

  // Keep server wallet aligned whenever local balance changes after earnings
  useEffect(() => {
    const t = setTimeout(() => {
      void import('../services/walletSyncService').then(({ syncHostWalletBalance }) => {
        void syncHostWalletBalance({
          hostId: user.id,
          coinBalance: user.coinBalance,
          displayName: user.name,
        });
      });
    }, 800);
    return () => clearTimeout(t);
  }, [user.coinBalance, user.id, user.name]);

  // Hydrate today's call/gift/live ledger from API so dashboard survives refresh
  const refreshTodayStats = useCallback(async () => {
    if (!user.id) return;
    try {
      const { fetchHostEarnings, localDayStartMs } = await import(
        '../services/hostEarningsApi'
      );
      const dayStart = localDayStartMs();
      if (hydratedDayRef.current && hydratedDayRef.current !== dayStart) {
        // New local day — clear in-memory day counters before hydrate
        setHostEarnings((e) => ({ ...e, call: 0, gift: 0 }));
        setCallsToday(0);
        setMyTodayMinutes(0);
        setTodayLiveSeconds(0);
      }
      hydratedDayRef.current = dayStart;

      const data = await fetchHostEarnings(user.id);
      const today = data.today;

      let callCoins = today.callCoins ?? 0;
      let giftCoins = today.giftCoins ?? 0;
      let callsCount = today.callsCount ?? 0;
      let callMinutes = today.callMinutes ?? 0;
      let liveSeconds = today.liveSeconds ?? 0;

      // Older API without `today` — derive from history rows
      if (
        callCoins === 0 &&
        giftCoins === 0 &&
        callsCount === 0 &&
        callMinutes === 0 &&
        liveSeconds === 0
      ) {
        const todayCalls = (data.calls || []).filter(
          (c) => (c.endedAt || c.startedAt || 0) >= dayStart,
        );
        const todayGifts = (data.gifts || []).filter(
          (g) => (g.createdAt || 0) >= dayStart,
        );
        callCoins = todayCalls.reduce((s, c) => s + (c.coinsSpent || 0), 0);
        giftCoins = todayGifts.reduce((s, g) => s + (g.coins || 0), 0);
        callsCount = todayCalls.length;
        callMinutes = todayCalls.reduce((s, c) => {
          const billed = Math.max(0, Math.floor(c.billedMinutes || 0));
          if (billed > 0) return s + billed;
          return s + Math.max(0, Math.ceil((c.durationSec || 0) / 60));
        }, 0);
      }

      setHostEarnings((e) => ({
        ...e,
        call: Math.max(e.call, callCoins),
        gift: Math.max(e.gift, giftCoins),
      }));
      setCallsToday((n) => Math.max(n, callsCount));
      setMyTodayMinutes((m) => Math.max(m, callMinutes));
      // Store completed live seconds only; LiveStudio adds the active session timer
      const completed =
        today.liveSecondsCompleted ??
        (today.liveActiveStartedAt
          ? Math.max(
              0,
              liveSeconds -
                Math.max(
                  0,
                  Math.floor((Date.now() - today.liveActiveStartedAt) / 1000),
                ),
            )
          : liveSeconds);
      setTodayLiveSeconds((s) => Math.max(s, completed));
      const summary = data.summary;
      const monthCoins = data.month?.totalCoins ?? 0;
      setHostLifetime({
        totalGifts: summary?.totalGifts ?? 0,
        coinsEarned: summary?.totalCoins ?? 0,
        walletBalance: summary?.walletBalance ?? 0,
        totalCalls: summary?.totalCalls ?? 0,
        followers: summary?.followers ?? 0,
        liveSeconds: summary?.liveSeconds ?? 0,
        liveSessions: summary?.liveSessions ?? 0,
        monthlyCoins: monthCoins,
      });
      if (typeof data.summary?.walletBalance === 'number') {
        setUser((u) => ({
          ...u,
          coinBalance: Math.max(u.coinBalance, data.summary.walletBalance),
        }));
      }
    } catch {
      /* keep local counters if API is briefly unreachable */
    }
  }, [user.id]);

  useEffect(() => {
    if (!user.id) return;
    void refreshTodayStats();
    const poll = setInterval(() => {
      void refreshTodayStats();
    }, 20_000);
    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') void refreshTodayStats();
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      clearInterval(poll);
      sub.remove();
    };
  }, [user.id, refreshTodayStats]);

  const bumpTodayLiveSeconds = useCallback((seconds: number) => {
    const n = Math.max(0, Math.floor(seconds));
    if (n <= 0) return;
    setTodayLiveSeconds((s) => s + n);
  }, []);

  // Ensure local data:/blob: photos become public https for Luma.
  // Also re-upload when the cached URL is a dead API /avatar link after redeploy.
  useEffect(() => {
    if (!user.id) return;
    const candidates = [
      user.avatarUrl,
      user.photoUrl,
      ...(Array.isArray(user.photoUrls) ? user.photoUrls : []),
    ].filter(Boolean) as string[];
    if (!candidates.length) return;

    const isApi = (u: string) =>
      /\/api\/hosts\/[^/]+\/avatar(?:\?|$)/i.test(u);
    const isLocal = (u: string) =>
      u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('file:');

    const local = candidates.find(isLocal);
    const apiLink = candidates.find(isApi);
    // Prefer uploading real local bytes; otherwise verify/re-resolve API link
    const source = local || apiLink;
    if (!source) return;

    let cancelled = false;
    void import('../services/mediaUploadService').then(
      ({ ensurePublicAvatarUrl }) => {
        void ensurePublicAvatarUrl(user.id, source).then((url) => {
          if (cancelled || !url) return;
          if (url === user.avatarUrl) return;
          setUser((u) => ({
            ...u,
            avatarUrl: url,
            photoUrl: url,
          }));
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [user.id, user.avatarUrl, user.photoUrl, user.photoUrls]);

  const registerBridgeCallStart = useCallback(() => {
    setCallsToday((n) => n + 1);
  }, []);

  const creditBridgeMinute = useCallback((amount: number) => {
    const n = Math.max(0, Math.floor(amount));
    if (n <= 0) return;
    setUser((u) => ({ ...u, coinBalance: u.coinBalance + n }));
    setHostEarnings((e) => ({ ...e, call: e.call + n }));
    setMyTodayMinutes((m) => m + 1);
    setTransactions((txs) => [
      {
        id: `tx_${Date.now()}`,
        type: 'earn',
        amount: n,
        label: '1v1 call minute',
        timestamp: Date.now(),
      },
      ...txs,
    ]);
  }, []);

  // Realtime WS for party gifts / wallet events + call_minute from Luma billing
  useEffect(() => {
    let unsub: (() => void) | undefined;
    void import('../services/realtimeWs').then(({ connectHostRealtime, subscribeRealtime }) => {
      connectHostRealtime({
        hostId: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
      });
      unsub = subscribeRealtime((event) => {
        if (event.type === 'gift:received' && event.payload?.coins) {
          const toHostId = String(event.payload.toHostId || '');
          if (toHostId !== user.id) return;
          const coins = Number(
            event.payload.hostCredited ?? event.payload.coins,
          ) || 0;
          const label = event.payload.giftName || event.payload.label || 'Gift';
          const emoji = event.payload.giftEmoji || '🎁';
          // Notify only — earnings applied once via SSE live_gift / wallet:updated
          // (WS + SSE both fire; double addEarn caused host "60" on a 30 gift).
          if (coins > 0) {
            notify('Gift received', `${emoji} ${label} · +${coins} coins`);
          }
        }
        if (event.type === 'gift:accepted' && event.payload?.coins) {
          const coins = Number(
            event.payload.hostCredited ?? event.payload.coins,
          ) || 0;
          if (coins > 0) {
            const label = event.payload.giftName || 'Gift';
            const emoji = event.payload.giftEmoji || '🎁';
            notify('Gift received', `${emoji} ${label} · +${coins} coins`);
          }
        }
        if (event.type === 'wallet:updated') {
          const uid = String(event.payload?.userId || '');
          if (uid !== user.id) return;
          const bal = Number(event.payload?.coinBalance);
          if (Number.isFinite(bal)) {
            setUser((u) => ({ ...u, coinBalance: Math.max(u.coinBalance, bal) }));
          }
        }
      });
    });
    return () => {
      unsub?.();
    };
  }, [user.avatarUrl, user.id, user.name]);

  // Live billing events from Luma — authoritative wallet + earnings (no optimistic double-credit)
  useEffect(() => {
    if (!user.id || !hostOnline) return;
    let stop: (() => void) | undefined;
    void import('../services/callBridge').then(({ listenHostBillingEvents }) => {
      stop = listenHostBillingEvents(
        user.id,
        (payload) => {
          const amount = Math.max(0, Math.floor(Number(payload.amount) || 0));
          const bal = payload.hostWallet?.coinBalance;
          if (typeof bal === 'number' && Number.isFinite(bal)) {
            setUser((u) => ({ ...u, coinBalance: Math.max(0, bal) }));
          } else if (amount > 0) {
            setUser((u) => ({ ...u, coinBalance: u.coinBalance + amount }));
          }
          if (amount > 0) {
            setHostEarnings((e) => ({ ...e, call: e.call + amount }));
            setMyTodayMinutes((m) => m + 1);
            setTransactions((txs) => [
              {
                id: `tx_call_${payload.callId}_${payload.billedMinutes}`,
                type: 'earn',
                amount,
                label: '1v1 call minute',
                timestamp: Date.now(),
              },
              ...txs,
            ]);
          }
        },
        (gift) => {
          const coins = Math.max(
            0,
            Math.floor(
              Number(
                (gift as { hostCredited?: number }).hostCredited ?? gift.coins,
              ) || 0,
            ),
          );
          if (coins > 0) {
            setHostEarnings((e) => ({ ...e, gift: e.gift + coins }));
            setHostLifetime((h) => ({
              ...h,
              totalGifts: h.totalGifts + 1,
              coinsEarned: h.coinsEarned + coins,
            }));
            // coinBalance comes from wallet:updated (server absolute)
          }
        },
      );    });
    return () => stop?.();
  }, [user.id, hostOnline]);

  // Admin remote control (end call, force offline, ban message)
  useEffect(() => {
    return listenHostControl(user.id, (cmd) => {
      if (cmd.type === 'end_call' || cmd.type === 'kick_live') {
        if (callRef.current?.status === 'active') {
          endCall();
        }
        notify('Admin', cmd.message || 'Call ended by admin.');
      } else if (cmd.type === 'force_offline') {
        setHostOnline(false, { silent: true });
        notify('Admin', cmd.message || 'You were set Offline by admin.');
      } else if (cmd.type === 'force_online') {
        setHostOnline(true, { silent: true });
        notify('Admin', cmd.message || 'You were set Online by admin.');
      } else if (cmd.type === 'ban' || cmd.type === 'suspend') {
        setHostOnline(false, { silent: true });
        // AuthContext Firebase listener also applies hostStatus → HostGate
        notify(
          cmd.type === 'ban' ? 'Banned' : 'Suspended',
          cmd.message || 'Your host account was restricted by admin.',
        );
      } else if (cmd.type === 'message') {
        notify('Message from Admin', cmd.message || 'Hello from admin.');
      } else if (cmd.type === 'approval' || cmd.type === 'approved') {
        notify('Approved', cmd.message || 'Your host application was approved!');
      } else if (cmd.type === 'force_update') {
        notify(
          'Update required',
          cmd.message ||
            'Admin requires a new Host app version. Please update to continue.',
        );
      }
    });
  }, [endCall, setHostOnline, user.id]);

  // Other hosts keep working — competition feels alive (dev/demo only)
  useEffect(() => {
    if (!__DEV__) return;
    const interval = setInterval(() => {
      setHosts((list) => {
        const nextHosts = list.map((h) => {
          if (!h.isOnline) return h;
          const next = { ...h };
          if (h.isOnCall) {
            const bump = 1 + (Math.random() > 0.7 ? 1 : 0);
            next.currentCallSeconds = h.currentCallSeconds + bump;
            if (next.currentCallSeconds % 60 === 0) {
              next.todayMinutes = h.todayMinutes + 1;
              next.todayCoins = h.todayCoins + Math.round(h.ratePerMinute);
            }
            if (next.currentCallSeconds > h.longestCallSeconds) {
              next.longestCallSeconds = next.currentCallSeconds;
            }
            if (next.currentCallSeconds > 12 * 60 && Math.random() > 0.92) {
              next.isOnCall = false;
              next.currentCallSeconds = 0;
              if (Math.random() > 0.5) next.isLive = true;
            }
          } else if (h.isLive) {
            if (Math.random() > 0.88) next.todayCoins = h.todayCoins + 8;
            if (Math.random() > 0.97) {
              next.isLive = false;
              next.isOnCall = true;
              next.currentCallSeconds = 30;
            }
          } else if (Math.random() > 0.96) {
            if (Math.random() > 0.45) {
              next.isOnCall = true;
              next.currentCallSeconds = 15;
            } else {
              next.isLive = true;
            }
          }
          return next;
        });

        const liveByHost = new Map(nextHosts.map((h) => [h.id, h.isLive]));
        setRooms((roomsList) =>
          roomsList.map((r) => {
            if (r.id.startsWith('my_')) return r;
            const hostLive = r.hostId ? liveByHost.get(r.hostId) : r.isLive;
            const isLive = hostLive ?? r.isLive;
            if (!isLive) return { ...r, isLive: false };
            const bump = Math.random() > 0.55 ? 1 : 0;
            return {
              ...r,
              isLive: true,
              viewers: Math.max(1, r.viewers + bump - (Math.random() > 0.9 ? 1 : 0)),
            };
          }),
        );

        return nextHosts;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const blockUser = useCallback((hostId: string) => {
    setBlockedIds((ids) => (ids.includes(hostId) ? ids : [...ids, hostId]));
    notify('Blocked', 'This user will no longer appear in your list.');
  }, []);

  const reportUser = useCallback(
    (hostId: string, reason: string) => {
      void import('../services/reportService')
        .then(({ submitUserReport }) =>
          submitUserReport({
            reporterId: user.id,
            reporterName: user.name,
            targetId: hostId,
            reason,
          }),
        )
        .then(() => notify('Report submitted', `Thanks. We received: "${reason}".`))
        .catch((e) =>
          notify('Report failed', e instanceof Error ? e.message : 'Could not submit report'),
        );
    },
    [user.id, user.name],
  );

  const markNewsRead = useCallback((id: string) => {
    setNews((items) =>
      items.map((n) => (n.id === id ? { ...n, unread: 0 } : n)),
    );
  }, []);

  const clearNewsCategory = useCallback((category: NewsTab) => {
    setNews((items) =>
      items.map((n) => (n.category === category ? { ...n, unread: 0 } : n)),
    );
    notify('Cleared', 'Unread messages marked as read.');
  }, []);

  const joinRoom = useCallback((roomId: string) => {
    if (myRoomId && roomId === myRoomId) {
      notify('Your room', 'Use Go Live on your room card instead.');
      return;
    }
    setJoinedRoomId(roomId);
    const room = rooms.find((r) => r.id === roomId);
    notify('Joined room', `You joined ${room?.title ?? 'the room'}.`);
  }, [myRoomId, rooms]);

  const leaveRoom = useCallback(() => {
    setJoinedRoomId(null);
    notify('Left room', 'You left the party room.');
  }, []);

  const followRoom = useCallback((roomId: string) => {
    setFollowedRoomIds((ids) => {
      const exists = ids.includes(roomId);
      notify(
        exists ? 'Unfollowed' : 'Followed',
        exists ? 'Removed from Following.' : 'Saved to Following.',
      );
      return exists ? ids.filter((id) => id !== roomId) : [...ids, roomId];
    });
  }, []);

  const createMyRoom = useCallback(() => {
    if (myRoomId) {
      notify('Already created', 'You already have a room. Go Live or End it below.');
      setPartyTab('party');
      return;
    }
    const id = `my_${Date.now()}`;
    const room: PartyRoom = {
      id,
      hostId: user.id,
      title: `${user.name}'s Room`,
      description: 'Beauty host room · Live',
      avatarUrl: user.avatarUrl,
      language: 'English',
      viewers: 0,
      gems: 0,
      rank: 1,
      isLive: false,
    };
    setRooms((list) => [room, ...list.map((r, i) => ({ ...r, rank: i + 2 }))]);
    setMyRoomId(id);
    setPartyTab('party');
    notify('Room created', 'Your party room is ready. Tap Go Live to start.');
  }, [myRoomId, user.avatarUrl, user.name]);

  const startPartyLive = useCallback(() => {
    if (!myRoomId) {
      notify('No room', 'Create your room first.');
      return;
    }
    setRooms((list) =>
      list.map((r) => (r.id === myRoomId ? { ...r, isLive: true, viewers: Math.max(r.viewers, 1) } : r)),
    );
    setHostOnline(true, { silent: true });
    setPartyLiveSeconds(0);
    notify(
      'You are live ✨',
      'Other hosts can see you live. Stay on to climb competition!',
    );
  }, [myRoomId, setHostOnline]);

  const endPartyLive = useCallback(() => {
    if (!myRoomId) return;
    setRooms((list) =>
      list.map((r) => (r.id === myRoomId ? { ...r, isLive: false } : r)),
    );
    notify('Live ended', `Session ${Math.floor(partyLiveSeconds / 60)}m ${partyLiveSeconds % 60}s. Gifts saved 💕`);
    setPartyLiveSeconds(0);
  }, [myRoomId, partyLiveSeconds]);

  const myRoom = useMemo(
    () => (myRoomId ? rooms.find((r) => r.id === myRoomId) ?? null : null),
    [myRoomId, rooms],
  );

  // Simulate viewers + gifts while host party is live (dev/demo only)
  useEffect(() => {
    if (!__DEV__) return;
    if (!myRoomId || !myRoom?.isLive) return;

    const interval = setInterval(() => {
      setPartyLiveSeconds((s) => s + 1);
      setRooms((list) =>
        list.map((r) => {
          if (r.id !== myRoomId || !r.isLive) return r;
          const bump = Math.random() > 0.6 ? 1 : 0;
          return { ...r, viewers: r.viewers + bump };
        }),
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [myRoomId, myRoom?.isLive]);

  const applyPayout = useCallback(
    (amount: number, gateway: string, withdrawalId: string, nextBalance: number) => {
      setUser((u) => ({ ...u, coinBalance: nextBalance }));
      // Keep today's earnings counters — only wallet balance changes on withdraw
      setTransactions((txs) => [
        {
          id: `tx_${Date.now()}`,
          type: 'payout',
          amount,
          label: `Cash-Out ${withdrawalId} · ${gateway}`,
          timestamp: Date.now(),
        },
        ...txs,
      ]);
    },
    [],
  );

  const requestPayout = useCallback(async () => {
    const amount = user.coinBalance;
    if (amount < 100) {
      notify(
        'Withdraw',
        'You need at least 100 coins to withdraw. Take more calls first.',
      );
      return;
    }
    try {
      await import('../services/walletSyncService').then(({ syncHostWalletBalance }) =>
        syncHostWalletBalance({
          hostId: user.id,
          coinBalance: user.coinBalance,
          displayName: user.name,
        }),
      );
      const { requestHostWithdrawal } = await import('../services/withdrawalService');
      const result = await requestHostWithdrawal({
        hostId: user.id,
        amountCoins: amount,
        gateway: 'easypaisa',
        accountName: user.name,
        accountNumber: user.phone || user.hostId || user.id,
        knownBalance: user.coinBalance,
        displayName: user.name,
      });
      if (!result.ok) {
        notify('Cash-Out failed', result.error || 'Gateway rejected payout');
        return;
      }
      applyPayout(
        amount,
        'easypaisa',
        result.withdrawal?.id || '',
        result.wallet?.coinBalance ?? 0,
      );
      notify(
        'Cash-Out submitted',
        `${amount} coins → EasyPaisa (status: ${result.withdrawal?.status || 'pending'})`,
      );
    } catch (e: unknown) {
      notify(
        'Cash-Out error',
        e instanceof Error ? e.message : 'Network error',
      );
    }
  }, [applyPayout, user.coinBalance, user.hostId, user.id, user.name, user.phone]);

  const refreshList = useCallback(() => {
    setHosts((list) => [...list].sort(() => Math.random() - 0.5));
    notify('Refreshed', 'Online user list updated.');
  }, []);

  const runHostTool = useCallback(
    (key: HostToolKey) => {
      switch (key) {
        case 'guide':
          notify(
            'Anchor Guide',
            '1) Go Online on Calls\n2) Accept video calls\n3) Keep beauty filter on\n4) Withdraw from Withdraw tab',
          );
          break;
        case 'hi': {
          const online = hosts.filter((h) => h.isOnline && !blockedIds.includes(h.id));
          if (!online.length) {
            notify('Hi', 'No online users to greet right now.');
            break;
          }
          addEarn(
            setUser,
            setHostEarnings,
            setTransactions,
            5,
            'managed',
            `Hi sent to ${online[0].name}`,
          );
          notify('Hi sent', `Greeting sent to ${online[0].name}. +5 coins`);
          break;
        }
        case 'live':
          setHostOnline(true, { silent: true });
          notify('Go Live', 'You are live/online and ready for calls.');
          break;
        case 'match':
          setHomeTab('match');
          notify('Match', 'Switched Home to Match filter — open Home tab.');
          break;
        case 'task':
          if (hostEarnings.task > 0) {
            notify('Task', 'Daily task already completed today.');
            break;
          }
          addEarn(setUser, setHostEarnings, setTransactions, 40, 'task', 'Daily task completed');
          setPoints((p) => p + 10);
          notify('Task complete', '+40 coins and +10 points earned.');
          break;
        case 'beauty':
          setBeautyOn((v) => {
            notify('Beauty', !v ? 'Beauty filters ON' : 'Beauty filters OFF');
            return !v;
          });
          break;
        case 'points':
          notify('Points', `You have ${points} points. Complete tasks to earn more.`);
          break;
        case 'gift':
          addEarn(setUser, setHostEarnings, setTransactions, 25, 'gift', 'Gift message bonus');
          notify('Gift Message', 'Template sent. +25 gift coins.');
          break;
        case 'profile':
          setUser((u) => ({ ...u, level: Math.min(u.level + 1, 20) }));
          notify('Profile updated', 'Host level increased. Open Profile to review.');
          break;
        case 'invite':
          if (hostEarnings.invite > 0) {
            void import('../services/phoneAuthService').then(({ copyInviteCode }) =>
              copyInviteCode(user.hostId || 'HOST2026'),
            );
            notify('Invite', `Code ${user.hostId || 'HOST2026'} copied. Invite reward already claimed.`);
            break;
          }
          void import('../services/phoneAuthService').then(({ copyInviteCode }) =>
            copyInviteCode(user.hostId || 'HOST2026'),
          );
          addEarn(setUser, setHostEarnings, setTransactions, 100, 'invite', 'Invite reward claimed');
          notify('Invite', `Code ${user.hostId || 'HOST2026'} copied. +100 invite coins (one-time).`);
          break;
        case 'props':
          setUser((u) => ({ ...u, gems: Number((u.gems + 1).toFixed(2)) }));
          notify('Props', 'New prop unlocked. +1 gem.');
          break;
        case 'livedata':
          notify(
            'Live Data',
            `Online: ${hostOnline ? 'Yes' : 'No'}\nCalls today: ${callsToday}\nCall income: ${hostEarnings.call}\nBeauty: ${beautyOn ? 'On' : 'Off'}`,
          );
          break;
        case 'party':
          notify(
            'Party Data',
            `Rooms joined: ${joinedRoomId ? 1 : 0}\nFollowing: ${followedRoomIds.length}\nOpen Party tab to manage rooms.`,
          );
          break;
        default:
          notify('Tool', 'Coming soon');
      }
    },
    [
      beautyOn,
      blockedIds,
      callsToday,
      followedRoomIds.length,
      hostEarnings.call,
      hostEarnings.invite,
      hostEarnings.task,
      hostOnline,
      hosts,
      joinedRoomId,
      points,
      setHostOnline,
    ],
  );

  const filteredHosts = useMemo(() => {
    let list = hosts.filter(
      (h) => !blockedIds.includes(h.id) && (h.isOnline || h.isLive),
    );
    if (homeFilter === 'working') {
      list = list.filter((h) => h.isOnCall || h.isLive || h.isOnline);
      list = [...list].sort((a, b) => {
        const score = (h: Host) =>
          (h.isOnCall ? 3000 : 0) + (h.isLive ? 2000 : 0) + h.todayMinutes * 10 + h.todayCoins;
        return score(b) - score(a);
      });
    } else if (homeFilter === 'live') {
      list = list.filter((h) => h.isLive);
    } else if (homeFilter === 'online') {
      list = list.filter((h) => h.isOnline);
    } else if (homeFilter === 'prime') {
      list = list.filter((h) => h.isVip);
    }
    return list;
  }, [blockedIds, homeFilter, hosts]);

  const liveHosts = useMemo(
    () => hosts.filter((h) => h.isLive && h.isOnline && !blockedIds.includes(h.id)),
    [blockedIds, hosts],
  );

  const workingHosts = useMemo(
    () =>
      hosts.filter(
        (h) =>
          !blockedIds.includes(h.id) &&
          h.isOnline &&
          (h.isOnCall || h.isLive || h.isOnline),
      ),
    [blockedIds, hosts],
  );

  const competition = useMemo(() => {
    const meCoins =
      hostEarnings.call +
      hostEarnings.gift +
      hostEarnings.task +
      hostEarnings.invite +
      hostEarnings.managed +
      320;
    const me: CompetitionEntry = {
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      todayMinutes: myTodayMinutes + (call?.status === 'active' ? Math.floor(call.seconds / 60) : 0),
      longestCallSeconds: Math.max(
        myLongestCallSeconds,
        call?.status === 'active' ? call.seconds : 0,
      ),
      todayCoins: meCoins,
      isLive: !!myRoom?.isLive,
      isOnCall: call?.status === 'active',
      isMe: true,
      rank: 0,
    };
    const others: CompetitionEntry[] = hosts
      .filter((h) => !blockedIds.includes(h.id) && (h.isOnline || h.isLive))
      .map((h) => ({
        id: h.id,
        name: h.name,
        avatarUrl: h.avatarUrl,
        todayMinutes: h.todayMinutes,
        longestCallSeconds: h.longestCallSeconds,
        todayCoins: h.todayCoins,
        isLive: h.isLive,
        isOnCall: h.isOnCall,
        isMe: false,
        rank: 0,
      }));
    const ranked = [me, ...others]
      .sort((a, b) => {
        if (b.todayMinutes !== a.todayMinutes) return b.todayMinutes - a.todayMinutes;
        return b.longestCallSeconds - a.longestCallSeconds;
      })
      .map((entry, i) => ({ ...entry, rank: i + 1 }));
    return ranked;
  }, [
    blockedIds,
    call,
    hostEarnings.call,
    hostEarnings.gift,
    hostEarnings.invite,
    hostEarnings.managed,
    hostEarnings.task,
    hosts,
    myLongestCallSeconds,
    myRoom?.isLive,
    myTodayMinutes,
    user.avatarUrl,
    user.id,
    user.name,
  ]);

  const myRank = useMemo(
    () => competition.find((c) => c.isMe)?.rank ?? competition.length,
    [competition],
  );

  const filteredNews = useMemo(
    () => news.filter((n) => n.category === newsTab),
    [news, newsTab],
  );

  const filteredRooms = useMemo(() => {
    const others = rooms.filter((r) => r.id !== myRoomId);
    if (partyTab === 'follow') {
      return others.filter((r) => followedRoomIds.includes(r.id));
    }
    if (partyTab === 'recent') {
      return joinedRoomId
        ? others.filter((r) => r.id === joinedRoomId)
        : others.filter((r) => r.isLive).slice(0, 3);
    }
    return others;
  }, [followedRoomIds, joinedRoomId, myRoomId, partyTab, rooms]);

  const unreadNewsCount = useMemo(
    () => news.reduce((sum, n) => sum + n.unread, 0),
    [news],
  );

  const value = useMemo(
    () => ({
      user,
      updateUser,
      hosts,
      news,
      rooms,
      packages: COIN_PACKAGES,
      transactions,
      blockedIds,
      call,
      homeFilter,
      setHomeFilter,
      homeTab,
      setHomeTab,
      newsTab,
      setNewsTab,
      partyTab,
      setPartyTab,
      followedRoomIds,
      joinedRoomId,
      myRoomId,
      myRoom,
      partyLiveSeconds,
      hostOnline,
      setHostOnline,
      hostEarnings,
      hostLifetime,
      callsToday,
      beautyOn,
      points,
      myTodayMinutes,
      todayLiveSeconds,
      myLongestCallSeconds,
      competition,
      myRank,
      liveHosts,
      workingHosts,
      buyCoins,
      startCall,
      endCall,
      blockUser,
      reportUser,
      markNewsRead,
      clearNewsCategory,
      joinRoom,
      leaveRoom,
      followRoom,
      createMyRoom,
      startPartyLive,
      endPartyLive,
      requestPayout,
      applyPayout,
      refreshTodayStats,
      bumpTodayLiveSeconds,
      runHostTool,
      refreshList,
      getHost,
      filteredHosts,
      filteredNews,
      filteredRooms,
      unreadNewsCount,
      incomingBridgeCall,
      clearIncomingBridgeCall,
      workspaceMode,
      setWorkspaceMode,
      hostPresenceStatus,
      partySeats,
      partyGroupGiftsToday,
      joinPartySeat,
      leavePartySeat,
      enterPartyRoom,
      registerBridgeCallStart,
      creditBridgeMinute,
    }),
    [
      user,
      updateUser,
      hosts,
      news,
      rooms,
      transactions,
      blockedIds,
      call,
      homeFilter,
      homeTab,
      newsTab,
      partyTab,
      followedRoomIds,
      joinedRoomId,
      myRoomId,
      myRoom,
      partyLiveSeconds,
      hostOnline,
      setHostOnline,
      hostEarnings,
      hostLifetime,
      callsToday,
      beautyOn,
      points,
      myTodayMinutes,
      todayLiveSeconds,
      myLongestCallSeconds,
      competition,
      myRank,
      liveHosts,
      workingHosts,
      buyCoins,
      startCall,
      endCall,
      blockUser,
      reportUser,
      markNewsRead,
      clearNewsCategory,
      joinRoom,
      leaveRoom,
      followRoom,
      createMyRoom,
      startPartyLive,
      endPartyLive,
      requestPayout,
      applyPayout,
      refreshTodayStats,
      bumpTodayLiveSeconds,
      runHostTool,
      refreshList,
      getHost,
      filteredHosts,
      filteredNews,
      filteredRooms,
      unreadNewsCount,
      incomingBridgeCall,
      clearIncomingBridgeCall,
      workspaceMode,
      setWorkspaceMode,
      hostPresenceStatus,
      partySeats,
      partyGroupGiftsToday,
      joinPartySeat,
      leavePartySeat,
      enterPartyRoom,
      registerBridgeCallStart,
      creditBridgeMinute,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
