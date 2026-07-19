import { ref, update } from 'firebase/database';
import { env } from '../config/env';
import { getFirebaseDb, isFirebaseReady } from '../lib/firebase';

export async function syncHostWalletBalance(input: {
  hostId: string;
  coinBalance: number;
  displayName?: string;
}) {
  const base = env.apiBaseUrl.replace(/\/$/, '');
  // Profile sync only — server ignores client coinBalance (anti-fraud)
  await fetch(`${base}/wallet/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': input.hostId,
    },
    body: JSON.stringify({
      userId: input.hostId,
      displayName: input.displayName,
      role: 'host',
    }),
  }).catch(() => undefined);

  if (isFirebaseReady()) {
    await update(ref(getFirebaseDb(), `hosts/${input.hostId}`), {
      coinBalance: input.coinBalance,
      walletUpdatedAt: Date.now(),
    }).catch(() => undefined);
  }
}

export async function creditHostEarnings(input: {
  hostId: string;
  amount: number;
  reason: string;
  displayName?: string;
}) {
  if (input.amount <= 0) return null;
  const base = env.apiBaseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/wallet/credit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': input.hostId,
    },
    body: JSON.stringify({
      userId: input.hostId,
      amount: input.amount,
      reason: input.reason.startsWith('host_earn')
        ? input.reason
        : `host_earn:${input.reason}`,
      displayName: input.displayName,
      role: 'host',
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    wallet?: { coinBalance: number };
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Could not credit wallet');
  }

  if (isFirebaseReady() && typeof data.wallet?.coinBalance === 'number') {
    await update(ref(getFirebaseDb(), `hosts/${input.hostId}`), {
      coinBalance: data.wallet.coinBalance,
      walletUpdatedAt: Date.now(),
    }).catch(() => undefined);
  }

  return data.wallet ?? null;
}

export async function persistPayoutMethod(input: {
  hostId: string;
  gateway: 'easypaisa' | 'jazzcash' | 'bank';
  accountName: string;
  accountNumber: string;
}) {
  if (!isFirebaseReady()) return;
  await update(ref(getFirebaseDb(), `hosts/${input.hostId}/payoutMethod`), {
    gateway: input.gateway,
    accountName: input.accountName,
    accountNumber: input.accountNumber,
    updatedAt: Date.now(),
  });
}
