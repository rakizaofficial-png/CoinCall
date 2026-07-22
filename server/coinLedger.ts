/**
 * Authoritative coin ledger — double-entry, idempotent, server-only math.
 *
 * Invariants:
 * 1. Never trust client amounts for calls/gifts (server reads rate + catalog).
 * 2. Every mutation creates a CoinTxn with before/after balances.
 * 3. Transfers: user debit = host credit + platform treasury credit.
 * 4. Duplicate Idempotency-Key / txnKey → same txn returned (no double spend).
 * 5. Sum(user spends on transfer) = sum(host credits) + sum(platform credits).
 */

import { randomUUID } from 'crypto';

export type TxnType =
  | 'call_minute'
  | 'gift'
  | 'purchase'
  | 'reward_daily'
  | 'reward_spin'
  | 'reward_welcome'
  | 'reward_referral'
  | 'admin_credit'
  | 'admin_debit'
  | 'withdrawal'
  | 'withdrawal_refund'
  | 'refund'
  | 'spend_misc';

export type TxnStatus = 'completed' | 'failed' | 'pending';

export type CoinTxn = {
  id: string;
  /** Client/server idempotency key — unique successful txn */
  txnKey: string;
  type: TxnType;
  status: TxnStatus;
  userId: string;
  hostId?: string;
  callId?: string;
  giftId?: string;
  /** Gross coins moved from user (or minted) */
  coinsDeducted: number;
  /** Net coins credited to host (after commission) */
  coinsCreditedHost: number;
  /** Coins retained by platform treasury */
  coinsCreditedPlatform: number;
  /** Coins minted into user wallet (purchase/reward) */
  coinsMinted: number;
  userBalanceBefore: number;
  userBalanceAfter: number;
  hostBalanceBefore?: number;
  hostBalanceAfter?: number;
  platformBalanceBefore?: number;
  platformBalanceAfter?: number;
  commissionRate: number;
  reason: string;
  meta?: Record<string, unknown>;
  createdAt: number;
  error?: string;
};

export type WalletLike = {
  userId: string;
  coinBalance: number;
  xp: number;
};

export const PLATFORM_TREASURY_ID = 'platform_treasury';

/** 0–1 fraction kept by platform on call/gift transfers. Default 30%. */
export function platformCommissionRate(): number {
  const raw = Number(process.env.PLATFORM_COMMISSION_RATE);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 0.9) return raw;
  return 0.3;
}

export function splitTransfer(
  gross: number,
  rate = platformCommissionRate(),
): { hostNet: number; platformCut: number } {
  const g = Math.max(0, Math.floor(gross));
  const platformCut = Math.min(g, Math.floor(g * rate));
  const hostNet = g - platformCut;
  return { hostNet, platformCut };
}

type LedgerDeps = {
  getWallet: (userId: string) => WalletLike;
  setWallet: (row: WalletLike) => void;
  ensureWallet: (userId: string, patch?: Partial<WalletLike>) => WalletLike;
  persist: () => void;
  onTxn?: (txn: CoinTxn) => void;
};

const txns: CoinTxn[] = [];
const byKey = new Map<string, string>(); // txnKey → txn id
const MAX_TXNS = 20_000;

export function dumpCoinTxns(): CoinTxn[] {
  return txns.slice(0, MAX_TXNS);
}

export function loadCoinTxns(rows?: CoinTxn[] | null) {
  if (!Array.isArray(rows)) return;
  txns.length = 0;
  byKey.clear();
  for (const row of rows) {
    if (!row?.id || !row?.txnKey) continue;
    txns.push(row);
    if (row.status === 'completed') byKey.set(row.txnKey, row.id);
  }
}

export function listCoinTxns(filter?: {
  userId?: string;
  hostId?: string;
  callId?: string;
  limit?: number;
}): CoinTxn[] {
  const limit = Math.min(500, Math.max(1, filter?.limit || 100));
  let list = txns;
  if (filter?.userId) {
    const u = filter.userId;
    list = list.filter(
      (t) => t.userId === u || t.hostId === u || t.userId === PLATFORM_TREASURY_ID,
    );
  }
  if (filter?.hostId) {
    list = list.filter((t) => t.hostId === filter.hostId);
  }
  if (filter?.callId) {
    list = list.filter((t) => t.callId === filter.callId);
  }
  return list.slice(0, limit);
}

export function getCoinTxnByKey(txnKey: string): CoinTxn | undefined {
  const id = byKey.get(txnKey);
  if (!id) return undefined;
  return txns.find((t) => t.id === id);
}

function remember(txn: CoinTxn, deps: LedgerDeps) {
  if (!txn.createdAt) txn.createdAt = Date.now();
  // Preserve insertion order when multiple txns share the same millisecond
  txn.createdAt += txns.length;
  txns.unshift(txn);
  if (txns.length > MAX_TXNS) txns.length = MAX_TXNS;
  if (txn.status === 'completed') byKey.set(txn.txnKey, txn.id);
  deps.onTxn?.(txn);
  deps.persist();
}

function failTxn(
  partial: Omit<CoinTxn, 'status' | 'createdAt'> & { error: string },
  deps: LedgerDeps,
): CoinTxn {
  const txn: CoinTxn = {
    ...partial,
    status: 'failed',
    createdAt: Date.now(),
  };
  remember(txn, deps);
  return txn;
}

/**
 * User → host transfer with platform cut.
 * Idempotent on txnKey.
 */
export function transferUserToHost(
  deps: LedgerDeps,
  input: {
    txnKey: string;
    type: Extract<TxnType, 'call_minute' | 'gift'>;
    userId: string;
    hostId: string;
    gross: number;
    callId?: string;
    giftId?: string;
    reason: string;
    commissionRate?: number;
    meta?: Record<string, unknown>;
    userDisplayName?: string;
    hostDisplayName?: string;
  },
): { ok: true; txn: CoinTxn } | { ok: false; txn: CoinTxn; code: number } {
  const existing = getCoinTxnByKey(input.txnKey);
  if (existing?.status === 'completed') {
    return { ok: true, txn: existing };
  }

  const gross = Math.max(0, Math.floor(Number(input.gross) || 0));
  const rate =
    typeof input.commissionRate === 'number'
      ? input.commissionRate
      : platformCommissionRate();

  if (!input.userId || !input.hostId || gross <= 0) {
    return {
      ok: false,
      code: 400,
      txn: failTxn(
        {
          id: randomUUID(),
          txnKey: input.txnKey,
          type: input.type,
          userId: input.userId || '',
          hostId: input.hostId,
          callId: input.callId,
          giftId: input.giftId,
          coinsDeducted: 0,
          coinsCreditedHost: 0,
          coinsCreditedPlatform: 0,
          coinsMinted: 0,
          userBalanceBefore: 0,
          userBalanceAfter: 0,
          commissionRate: rate,
          reason: input.reason,
          meta: input.meta,
          error: 'Invalid transfer',
        },
        deps,
      ),
    };
  }

  if (input.userId === input.hostId) {
    return {
      ok: false,
      code: 403,
      txn: failTxn(
        {
          id: randomUUID(),
          txnKey: input.txnKey,
          type: input.type,
          userId: input.userId,
          hostId: input.hostId,
          callId: input.callId,
          giftId: input.giftId,
          coinsDeducted: 0,
          coinsCreditedHost: 0,
          coinsCreditedPlatform: 0,
          coinsMinted: 0,
          userBalanceBefore: 0,
          userBalanceAfter: 0,
          commissionRate: rate,
          reason: input.reason,
          meta: input.meta,
          error: 'Cannot transfer to self',
        },
        deps,
      ),
    };
  }

  const user = deps.ensureWallet(input.userId, {
    userId: input.userId,
  } as WalletLike);
  const userBefore = user.coinBalance;
  if (userBefore < gross) {
    return {
      ok: false,
      code: 402,
      txn: failTxn(
        {
          id: randomUUID(),
          txnKey: input.txnKey,
          type: input.type,
          userId: input.userId,
          hostId: input.hostId,
          callId: input.callId,
          giftId: input.giftId,
          coinsDeducted: 0,
          coinsCreditedHost: 0,
          coinsCreditedPlatform: 0,
          coinsMinted: 0,
          userBalanceBefore: userBefore,
          userBalanceAfter: userBefore,
          commissionRate: rate,
          reason: input.reason,
          meta: input.meta,
          error: 'Insufficient coins',
        },
        deps,
      ),
    };
  }

  const { hostNet, platformCut } = splitTransfer(gross, rate);
  const host = deps.ensureWallet(input.hostId, {
    userId: input.hostId,
  } as WalletLike);
  const platform = deps.ensureWallet(PLATFORM_TREASURY_ID, {
    userId: PLATFORM_TREASURY_ID,
  } as WalletLike);

  const hostBefore = host.coinBalance;
  const platformBefore = platform.coinBalance;

  user.coinBalance = userBefore - gross;
  user.xp = (user.xp || 0) + gross;
  host.coinBalance = hostBefore + hostNet;
  host.xp = (host.xp || 0) + hostNet;
  platform.coinBalance = platformBefore + platformCut;

  deps.setWallet(user);
  deps.setWallet(host);
  deps.setWallet(platform);

  const txn: CoinTxn = {
    id: randomUUID(),
    txnKey: input.txnKey,
    type: input.type,
    status: 'completed',
    userId: input.userId,
    hostId: input.hostId,
    callId: input.callId,
    giftId: input.giftId,
    coinsDeducted: gross,
    coinsCreditedHost: hostNet,
    coinsCreditedPlatform: platformCut,
    coinsMinted: 0,
    userBalanceBefore: userBefore,
    userBalanceAfter: user.coinBalance,
    hostBalanceBefore: hostBefore,
    hostBalanceAfter: host.coinBalance,
    platformBalanceBefore: platformBefore,
    platformBalanceAfter: platform.coinBalance,
    commissionRate: rate,
    reason: input.reason,
    meta: input.meta,
    createdAt: Date.now(),
  };
  remember(txn, deps);

  // Conservation check (dev assert)
  const moved = txn.coinsCreditedHost + txn.coinsCreditedPlatform;
  if (moved !== txn.coinsDeducted) {
    console.error('[coinLedger] CONSERVATION BROKEN', txn);
  }

  return { ok: true, txn };
}

/** Mint coins into a user wallet (purchase / reward). Idempotent. */
export function mintCoins(
  deps: LedgerDeps,
  input: {
    txnKey: string;
    type: Extract<
      TxnType,
      | 'purchase'
      | 'reward_daily'
      | 'reward_spin'
      | 'reward_welcome'
      | 'reward_referral'
      | 'admin_credit'
      | 'refund'
      | 'withdrawal_refund'
    >;
    userId: string;
    amount: number;
    reason: string;
    meta?: Record<string, unknown>;
  },
): { ok: true; txn: CoinTxn } | { ok: false; txn: CoinTxn; code: number } {
  const existing = getCoinTxnByKey(input.txnKey);
  if (existing?.status === 'completed') return { ok: true, txn: existing };

  const amount = Math.floor(Number(input.amount) || 0);
  if (!input.userId || amount <= 0) {
    return {
      ok: false,
      code: 400,
      txn: failTxn(
        {
          id: randomUUID(),
          txnKey: input.txnKey,
          type: input.type,
          userId: input.userId || '',
          coinsDeducted: 0,
          coinsCreditedHost: 0,
          coinsCreditedPlatform: 0,
          coinsMinted: 0,
          userBalanceBefore: 0,
          userBalanceAfter: 0,
          commissionRate: 0,
          reason: input.reason,
          meta: input.meta,
          error: 'Invalid mint',
        },
        deps,
      ),
    };
  }

  const user = deps.ensureWallet(input.userId);
  const before = user.coinBalance;
  user.coinBalance = before + amount;
  user.xp = (user.xp || 0) + Math.min(amount, 50_000);
  deps.setWallet(user);

  const txn: CoinTxn = {
    id: randomUUID(),
    txnKey: input.txnKey,
    type: input.type,
    status: 'completed',
    userId: input.userId,
    coinsDeducted: 0,
    coinsCreditedHost: 0,
    coinsCreditedPlatform: 0,
    coinsMinted: amount,
    userBalanceBefore: before,
    userBalanceAfter: user.coinBalance,
    commissionRate: 0,
    reason: input.reason,
    meta: input.meta,
    createdAt: Date.now(),
  };
  remember(txn, deps);
  return { ok: true, txn };
}

/** Debit only (withdrawal / admin). Idempotent. No host credit. */
export function debitOnly(
  deps: LedgerDeps,
  input: {
    txnKey: string;
    type: Extract<TxnType, 'withdrawal' | 'admin_debit' | 'spend_misc'>;
    userId: string;
    amount: number;
    reason: string;
    meta?: Record<string, unknown>;
  },
): { ok: true; txn: CoinTxn } | { ok: false; txn: CoinTxn; code: number } {
  const existing = getCoinTxnByKey(input.txnKey);
  if (existing?.status === 'completed') return { ok: true, txn: existing };

  const amount = Math.floor(Number(input.amount) || 0);
  if (!input.userId || amount <= 0) {
    return {
      ok: false,
      code: 400,
      txn: failTxn(
        {
          id: randomUUID(),
          txnKey: input.txnKey,
          type: input.type,
          userId: input.userId || '',
          coinsDeducted: 0,
          coinsCreditedHost: 0,
          coinsCreditedPlatform: 0,
          coinsMinted: 0,
          userBalanceBefore: 0,
          userBalanceAfter: 0,
          commissionRate: 0,
          reason: input.reason,
          meta: input.meta,
          error: 'Invalid debit',
        },
        deps,
      ),
    };
  }

  const user = deps.ensureWallet(input.userId);
  const before = user.coinBalance;
  if (before < amount) {
    return {
      ok: false,
      code: 402,
      txn: failTxn(
        {
          id: randomUUID(),
          txnKey: input.txnKey,
          type: input.type,
          userId: input.userId,
          coinsDeducted: 0,
          coinsCreditedHost: 0,
          coinsCreditedPlatform: 0,
          coinsMinted: 0,
          userBalanceBefore: before,
          userBalanceAfter: before,
          commissionRate: 0,
          reason: input.reason,
          meta: input.meta,
          error: 'Insufficient coins',
        },
        deps,
      ),
    };
  }

  user.coinBalance = before - amount;
  user.xp = (user.xp || 0) + amount;
  deps.setWallet(user);

  const txn: CoinTxn = {
    id: randomUUID(),
    txnKey: input.txnKey,
    type: input.type,
    status: 'completed',
    userId: input.userId,
    coinsDeducted: amount,
    coinsCreditedHost: 0,
    coinsCreditedPlatform: 0,
    coinsMinted: 0,
    userBalanceBefore: before,
    userBalanceAfter: user.coinBalance,
    commissionRate: 0,
    reason: input.reason,
    meta: input.meta,
    createdAt: Date.now(),
  };
  remember(txn, deps);
  return { ok: true, txn };
}

export function deriveWalletBalanceFromTxns(
  userId: string,
  rows: CoinTxn[] = txns,
): { balance: number | null; lastTxnAt: number | null } {
  let balance = 0;
  let touched = false;
  let lastTxnAt: number | null = null;
  const sorted = [...rows]
    .filter((t) => t.status === 'completed')
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  for (const t of sorted) {
    if (t.userId === userId) {
      balance = t.userBalanceAfter;
      touched = true;
      lastTxnAt = t.createdAt;
    }
    if (t.hostId === userId && t.hostBalanceAfter != null) {
      balance = t.hostBalanceAfter;
      touched = true;
      lastTxnAt = t.createdAt;
    }
  }
  return { balance: touched ? balance : null, lastTxnAt };
}

export function reconcileWalletBalance(
  deps: LedgerDeps,
  userId: string,
): { ok: boolean; walletBalance: number; derivedBalance: number | null } {
  const row = deps.ensureWallet(userId);
  const { balance: derived } = deriveWalletBalanceFromTxns(userId);
  if (derived != null && derived !== row.coinBalance) {
    row.coinBalance = derived;
    deps.setWallet(row);
    deps.persist();
  }
  return {
    ok: derived == null || derived === row.coinBalance,
    walletBalance: row.coinBalance,
    derivedBalance: derived,
  };
}

/** Audit helpers for tests / admin */
export function auditConservation(sample: CoinTxn[]): {
  ok: boolean;
  broken: CoinTxn[];
} {
  const broken = sample.filter(
    (t) =>
      t.status === 'completed' &&
      (t.type === 'call_minute' || t.type === 'gift') &&
      t.coinsDeducted !== t.coinsCreditedHost + t.coinsCreditedPlatform,
  );
  return { ok: broken.length === 0, broken };
}
