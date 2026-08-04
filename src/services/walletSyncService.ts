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
  const res = await fetch(`${base}/wallet/sync`, {
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
  }).catch(() => null);

  const data = res
    ? ((await res.json().catch(() => ({}))) as {
        wallet?: { appId?: string; coinBalance?: number };
      })
    : null;

  if (isFirebaseReady()) {
    const patch: Record<string, unknown> = { walletUpdatedAt: Date.now() };
    if (typeof data?.wallet?.coinBalance === 'number') {
      patch.coinBalance = data.wallet.coinBalance;
    }
    if (data?.wallet?.appId) patch.appId = data.wallet.appId;
    await update(ref(getFirebaseDb(), `hosts/${input.hostId}`), patch).catch(
      () => undefined,
    );
  }

  return data?.wallet ?? null;
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
