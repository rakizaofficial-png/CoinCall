/**
 * =============================================================================
 * WALLET + USER PROFILE — LIVE API (no hardcoded balances)
 * =============================================================================
 */

import { requireApiBase } from "@/config/apiConfig";
import { getAuthHeaders, getAuthUser } from "@/lib/auth";

export type WalletSnapshot = {
  userId: string;
  coinBalance: number;
  xp: number;
  isPremium: boolean;
  displayName: string;
  avatarUrl?: string;
};

function accountUserId(): string {
  const user = getAuthUser();
  if (!user?.userId) throw new Error("Please sign in to continue");
  return user.userId;
}

/** Kept for callers while identity is now always the signed-in account ID. */
export function getDeviceUserId() {
  return accountUserId();
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const base = requireApiBase();
  const userId = accountUserId();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(userId),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = (data as { error?: unknown }).error;
    throw new Error(typeof error === "string" ? error : `API ${res.status}`);
  }
  return data as T;
}

function assertWalletOwner(wallet: WalletSnapshot, userId: string) {
  if (wallet.userId !== userId) {
    throw new Error("Wallet account mismatch. Please sign in again.");
  }
  return wallet;
}

/** Ensure user row exists server-side; returns live wallet */
export async function fetchOrCreateWallet(): Promise<WalletSnapshot> {
  const user = getAuthUser();
  if (!user) throw new Error("Please sign in to continue");
  const userId = user.userId;
  const data = await api<{ wallet: WalletSnapshot }>("/wallet/me", {
    method: "POST",
    body: JSON.stringify({
      userId,
      displayName: user.displayName || user.email.split("@")[0] || "Luma Fan",
      updateProfile: true,
    }),
  });
  return assertWalletOwner(data.wallet, userId);
}

export async function refreshWallet(): Promise<WalletSnapshot> {
  const userId = accountUserId();
  const data = await api<{ wallet: WalletSnapshot }>(
    `/wallet/${encodeURIComponent(userId)}`,
  );
  return assertWalletOwner(data.wallet, userId);
}

/** Authoritative spend — server rejects if balance insufficient */
export async function spendCoinsApi(input: {
  amount: number;
  reason: string;
  meta?: Record<string, unknown>;
}): Promise<WalletSnapshot> {
  const userId = accountUserId();
  const data = await api<{ wallet: WalletSnapshot }>("/wallet/spend", {
    method: "POST",
    body: JSON.stringify({
      userId,
      amount: input.amount,
      reason: input.reason,
      meta: input.meta,
    }),
  });
  return assertWalletOwner(data.wallet, userId);
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
