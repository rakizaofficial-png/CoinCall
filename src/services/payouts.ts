/**
 * ============================================================================
 * HOST PAYOUT GATEWAYS — EasyPaisa / JazzCash / Local Bank
 * ============================================================================
 *
 * SETUP — EASYPAISA (JazzCash similar)
 * 1. Register as EasyPaisa Merchant: https://easypaisa.com.pk/business
 * 2. Obtain: storeId, merchantId, HMAC hash key from merchant portal
 * 3. Put secrets on the API server ONLY:
 *      EASYPAISA_STORE_ID=
 *      EASYPAISA_MERCHANT_ID=
 *      EASYPAISA_HASH_KEY=
 *      JAZZCASH_MERCHANT_ID=
 *      JAZZCASH_PASSWORD=
 *      JAZZCASH_INTEGRITY_SALT=
 * 4. Client only calls POST {API}/payouts/request with Bearer host JWT
 * 5. Never put merchant HMAC keys in Expo EXPO_PUBLIC_* vars
 *
 * SETUP — LOCAL BANK TRANSFER
 * 1. Collect IBAN + account title via Host Earnings form
 * 2. API queues payout → your ops / banking partner API settles T+1
 * ============================================================================
 */

import { env } from '../config/env';

export type PayoutMethod = 'easypaisa' | 'jazzcash' | 'bank';

export type PayoutRequestInput = {
  method: PayoutMethod;
  amountCoins: number;
  /** PKR equivalent computed server-side — client may hint */
  destination: {
    accountName: string;
    accountNumber: string;
    bankName?: string;
    iban?: string;
  };
};

export type PayoutResult =
  | { ok: true; payoutId: string; status: 'queued' | 'processing' }
  | { ok: false; error: string };

export async function requestHostPayout(
  input: PayoutRequestInput,
  authToken: string,
): Promise<PayoutResult> {
  try {
    const res = await fetch(`${env.apiBaseUrl}/payouts/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.error || 'Payout failed' };
    }
    return {
      ok: true,
      payoutId: data.payoutId as string,
      status: (data.status as 'queued' | 'processing') || 'queued',
    };
  } catch (e: unknown) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }
}

export async function fetchPayoutHistory(authToken: string) {
  const res = await fetch(`${env.apiBaseUrl}/payouts/me`, {
    headers: { Authorization: `Bearer ${authToken}` },
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not load payouts');
  return data.payouts as Array<{
    id: string;
    amountCoins: number;
    method: PayoutMethod;
    status: string;
    createdAt: number;
  }>;
}
