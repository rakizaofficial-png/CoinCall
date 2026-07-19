/**
 * =============================================================================
 * WALLET + USER PROFILE — LIVE API (no hardcoded balances)
 * =============================================================================
 */

import { apiConfig, requireApiBase } from "@/config/apiConfig";

export type WalletSnapshot = {
  userId: string;
  coinBalance: number;
  xp: number;
  isPremium: boolean;
  displayName: string;
  avatarUrl?: string;
};

function deviceUserId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const key = apiConfig.deviceUserKey;
    let id = localStorage.getItem(key);
    if (!id) {
      id = `luma_${crypto.randomUUID()}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `luma_${Date.now()}`;
  }
}

export function getDeviceUserId() {
  return deviceUserId();
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const base = requireApiBase();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": deviceUserId(),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API ${res.status}`);
  return data as T;
}

/** Ensure user row exists server-side; returns live wallet */
export async function fetchOrCreateWallet(): Promise<WalletSnapshot> {
  const userId = deviceUserId();
  const data = await api<{ wallet: WalletSnapshot }>("/wallet/me", {
    method: "POST",
    body: JSON.stringify({ userId, displayName: "Luma Fan" }),
  });
  return data.wallet;
}

export async function refreshWallet(): Promise<WalletSnapshot> {
  const userId = deviceUserId();
  const data = await api<{ wallet: WalletSnapshot }>(
    `/wallet/${encodeURIComponent(userId)}`,
  );
  return data.wallet;
}

/** Authoritative spend — server rejects if balance insufficient */
export async function spendCoinsApi(input: {
  amount: number;
  reason: string;
  meta?: Record<string, unknown>;
}): Promise<WalletSnapshot> {
  const userId = deviceUserId();
  const data = await api<{ wallet: WalletSnapshot }>("/wallet/spend", {
    method: "POST",
    body: JSON.stringify({
      userId,
      amount: input.amount,
      reason: input.reason,
      meta: input.meta,
    }),
  });
  return data.wallet;
}

export async function fetchCoinCatalog(): Promise<
  {
    productId: string;
    coins: number;
    bonusCoins: number;
    priceLabel: string;
    title: string;
    popular?: boolean;
  }[]
> {
  try {
    const data = await api<{
      products: {
        productId: string;
        coins: number;
        bonusCoins: number;
        priceLabel: string;
        title: string;
        popular?: boolean;
      }[];
    }>("/wallet/products");
    return data.products;
  } catch {
    const { IAP_PRODUCTS } = await import("./payments/iapCatalog");
    return IAP_PRODUCTS;
  }
}
