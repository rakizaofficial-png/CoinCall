"use client";

/**
 * Production App store — balances come from CoinCall `/wallet/*` APIs.
 * No hardcoded coin / XP defaults.
 */

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
import { vipTierFromXp, type VipTier } from "@/lib/ledger";
import {
  fetchOrCreateWallet,
  getDeviceUserId,
  spendCoinsApi,
} from "@/lib/walletApi";
import { getRealtimeClient } from "@/lib/realtime/websocket";
import { requireApiBase } from "@/config/apiConfig";

type Toast = { id: number; text: string };

export type InboxMessage = {
  id: string;
  hostId: string;
  hostName: string;
  text: string;
  at: number;
  unread?: boolean;
};

type AppStore = {
  ready: boolean;
  userId: string;
  coins: number;
  xp: number;
  vipTier: VipTier;
  isPremium: boolean;
  following: string[];
  toasts: Toast[];
  inbox: InboxMessage[];
  unreadInbox: number;
  spend: (amount: number, label?: string) => boolean;
  spendAsync: (amount: number, label?: string) => Promise<boolean>;
  addCoins: (amount: number, label?: string) => void;
  syncWallet: () => Promise<void>;
  addXp: (amount: number) => void;
  toggleFollow: (id: string) => void;
  setPremium: (v: boolean) => void;
  pushToast: (text: string) => void;
  markInboxRead: () => void;
  topUpOpen: boolean;
  topUpGrace: number;
  openTopUp: (grace?: number) => void;
  closeTopUp: () => void;
  entranceBlast: boolean;
  entranceReady: boolean;
  triggerEntranceBlast: () => void;
  clearEntranceBlast: () => void;
};

const Ctx = createContext<AppStore | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState("");
  const [coins, setCoins] = useState(0);
  const [xp, setXp] = useState(0);
  const [isPremium, setPremium] = useState(false);
  const [following, setFollowing] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpGrace, setTopUpGrace] = useState(15);
  const [entranceBlast, setEntranceBlast] = useState(false);
  const [entranceReady, setEntranceReady] = useState(false);
  const [inbox, setInbox] = useState<InboxMessage[]>([]);
  const graceRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const vipTier = useMemo(() => vipTierFromXp(xp), [xp]);
  const unreadInbox = useMemo(
    () => inbox.filter((m) => m.unread).length,
    [inbox],
  );

  const pushToast = useCallback((text: string) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 2400);
  }, []);

  const markInboxRead = useCallback(() => {
    setInbox((list) => list.map((m) => ({ ...m, unread: false })));
  }, []);

  const prependInbox = useCallback((msg: InboxMessage) => {
    setInbox((list) => {
      if (list.some((m) => m.id === msg.id)) return list;
      return [msg, ...list].slice(0, 50);
    });
  }, []);

  const syncWallet = useCallback(async () => {
    const wallet = await fetchOrCreateWallet();
    setUserId(wallet.userId);
    setCoins(wallet.coinBalance);
    setXp(wallet.xp);
    setPremium(wallet.isPremium);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;

    (async () => {
      try {
        const id = getDeviceUserId();
        if (cancelled) return;
        setUserId(id);
        await syncWallet();
        if (cancelled) return;
        setReady(true);
        setEntranceReady(true);

        const rt = getRealtimeClient(id);
        rt.connect();
        unsub = rt.subscribe((ev) => {
          if (ev.type === "wallet:updated" && ev.payload.userId === id) {
            setCoins(ev.payload.coinBalance);
            setXp(ev.payload.xp);
          }
          if (ev.type === "mass:text") {
            const p = ev.payload;
            prependInbox({
              id: p.id || `mt_${p.at}_${p.hostId}`,
              hostId: p.hostId,
              hostName: p.hostName,
              text: p.text,
              at: p.at || Date.now(),
              unread: true,
            });
            pushToast(`${p.hostName}: ${p.text.slice(0, 60)}`);
          }
        });

        try {
          const inboxRes = await fetch(
            `${requireApiBase()}/users/inbox?userId=${encodeURIComponent(id)}`,
            { cache: "no-store" },
          );
          if (inboxRes.ok) {
            const data = (await inboxRes.json()) as {
              items?: Array<{
                id: string;
                hostId: string;
                hostName: string;
                text: string;
                at: number;
              }>;
            };
            if (!cancelled && data.items?.length) {
              setInbox(
                data.items.map((m) => ({
                  ...m,
                  unread: false,
                })),
              );
            }
          }
        } catch {
          /* optional */
        }
      } catch (e) {
        if (!cancelled) {
          pushToast(
            e instanceof Error
              ? e.message
              : "Wallet API unreachable — check NEXT_PUBLIC_API_BASE_URL",
          );
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
      if (graceRef.current) clearInterval(graceRef.current);
    };
  }, [prependInbox, pushToast, syncWallet]);

  const clearEntranceBlast = useCallback(() => setEntranceBlast(false), []);
  const triggerEntranceBlast = useCallback(() => setEntranceBlast(true), []);

  const closeTopUp = useCallback(() => {
    setTopUpOpen(false);
    if (graceRef.current) {
      clearInterval(graceRef.current);
      graceRef.current = null;
    }
  }, []);

  const openTopUp = useCallback((grace = 15) => {
    setTopUpGrace(grace);
    setTopUpOpen(true);
    if (graceRef.current) clearInterval(graceRef.current);
    graceRef.current = setInterval(() => {
      setTopUpGrace((g) => {
        if (g <= 1) {
          if (graceRef.current) clearInterval(graceRef.current);
          graceRef.current = null;
          return 0;
        }
        return g - 1;
      });
    }, 1000);
  }, []);

  const addXp = useCallback((amount: number) => {
    setXp((x) => x + amount);
  }, []);

  const spendAsync = useCallback(
    async (amount: number, label?: string) => {
      try {
        const wallet = await spendCoinsApi({
          amount,
          reason: label || "spend",
        });
        setCoins(wallet.coinBalance);
        setXp(wallet.xp);
        if (label) pushToast(label);
        return true;
      } catch {
        openTopUp(15);
        pushToast("Not enough coins — recharge required");
        return false;
      }
    },
    [openTopUp, pushToast],
  );

  const spend = useCallback(
    (amount: number, label?: string) => {
      if (coins < amount) {
        openTopUp(15);
        pushToast("Not enough coins — recharge required");
        return false;
      }
      setCoins((c) => c - amount);
      setXp((x) => x + amount);
      void spendCoinsApi({ amount, reason: label || "spend" }).catch(() => {
        void syncWallet();
        openTopUp(15);
      });
      if (label) pushToast(label);
      return true;
    },
    [coins, openTopUp, pushToast, syncWallet],
  );

  const addCoins = useCallback(
    (amount: number, label?: string) => {
      setCoins((c) => c + amount);
      if (label) pushToast(label);
      closeTopUp();
      void syncWallet();
    },
    [closeTopUp, pushToast, syncWallet],
  );

  const toggleFollow = useCallback((id: string) => {
    setFollowing((f) =>
      f.includes(id) ? f.filter((x) => x !== id) : [...f, id],
    );
  }, []);

  const value = useMemo(
    () => ({
      ready,
      userId,
      coins,
      xp,
      vipTier,
      isPremium,
      following,
      toasts,
      inbox,
      unreadInbox,
      spend,
      spendAsync,
      addCoins,
      syncWallet,
      addXp,
      toggleFollow,
      setPremium,
      pushToast,
      markInboxRead,
      topUpOpen,
      topUpGrace,
      openTopUp,
      closeTopUp,
      entranceBlast,
      entranceReady,
      triggerEntranceBlast,
      clearEntranceBlast,
    }),
    [
      ready,
      userId,
      coins,
      xp,
      vipTier,
      isPremium,
      following,
      toasts,
      inbox,
      unreadInbox,
      spend,
      spendAsync,
      addCoins,
      syncWallet,
      addXp,
      toggleFollow,
      pushToast,
      markInboxRead,
      topUpOpen,
      topUpGrace,
      openTopUp,
      closeTopUp,
      entranceBlast,
      entranceReady,
      triggerEntranceBlast,
      clearEntranceBlast,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
