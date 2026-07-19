/**
 * =============================================================================
 * HOST WITHDRAWAL GATEWAY CLIENT
 * =============================================================================
 *
 * SETUP (Host cash-out):
 * 1. EasyPaisa merchant portal → copy Merchant ID, Store ID, Hash Key
 *    into CoinCall server .env: EASYPAY_MERCHANT_ID, EASYPAY_STORE_ID, EASYPAY_HASH_KEY
 * 2. JazzCash merchant → JAZZCASH_MERCHANT_ID, JAZZCASH_PASSWORD, JAZZCASH_INTEGRITY_SALT
 * 3. Local bank payout partner → BANK_PAYOUT_WEBHOOK_SECRET
 * 4. Never call gateway APIs from the mobile client — only via CoinCall API.
 * =============================================================================
 */

import { env } from '../config/env';

export type WithdrawalGateway = 'easypaisa' | 'jazzcash' | 'bank';

export type WithdrawalPayload = {
  hostId: string;
  amountCoins: number;
  gateway: WithdrawalGateway;
  accountName: string;
  accountNumber: string;
  knownBalance?: number;
  displayName?: string;
};

export type WithdrawalResult = {
  ok: boolean;
  withdrawal?: {
    id: string;
    status: string;
    providerRef?: string;
    error?: string;
  };
  wallet?: { coinBalance: number };
  error?: string;
};

export async function requestHostWithdrawal(
  payload: WithdrawalPayload,
): Promise<WithdrawalResult> {
  const base = env.apiBaseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/host/withdrawals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': payload.hostId,
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as WithdrawalResult & { error?: string };
  if (!res.ok) {
    return { ok: false, error: data.error || 'Withdrawal failed' };
  }
  return data;
}

export async function listHostWithdrawals(hostId: string) {
  const base = env.apiBaseUrl.replace(/\/$/, '');
  const res = await fetch(
    `${base}/host/withdrawals/${encodeURIComponent(hostId)}`,
    {
      headers: { 'X-User-Id': hostId },
    },
  );
  if (!res.ok) throw new Error('Could not load withdrawals');
  return (await res.json()) as { withdrawals: unknown[] };
}
