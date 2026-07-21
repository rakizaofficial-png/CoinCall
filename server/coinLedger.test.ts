/**
 * Unit tests for coin ledger conservation + idempotency.
 * Run: npx tsx server/coinLedger.test.ts
 */
import assert from 'node:assert/strict';
import {
  PLATFORM_TREASURY_ID,
  auditConservation,
  debitOnly,
  dumpCoinTxns,
  loadCoinTxns,
  mintCoins,
  splitTransfer,
  transferUserToHost,
  type WalletLike,
} from './coinLedger.ts';

process.env.PLATFORM_COMMISSION_RATE = '0.3';

const store = new Map<string, WalletLike>();

function reset() {
  store.clear();
  loadCoinTxns([]);
}

function deps() {
  return {
    getWallet: (id: string) => store.get(id)!,
    setWallet: (row: WalletLike) => {
      store.set(row.userId, { ...row });
    },
    ensureWallet: (id: string) => {
      let row = store.get(id);
      if (!row) {
        row = { userId: id, coinBalance: 0, xp: 0 };
        store.set(id, row);
      }
      return row;
    },
    persist: () => undefined,
  };
}

function seed(userId: string, coins: number) {
  store.set(userId, { userId, coinBalance: coins, xp: 0 });
}

// --- split math ---
{
  const s = splitTransfer(80, 0.3);
  assert.equal(s.platformCut, 24);
  assert.equal(s.hostNet, 56);
  assert.equal(s.hostNet + s.platformCut, 80);
}

// --- 1 minute call @ 80 from 500 ---
{
  reset();
  seed('u1', 500);
  seed('h1', 0);
  const d = deps();
  const r = transferUserToHost(d, {
    txnKey: 'call_c1_m1',
    type: 'call_minute',
    userId: 'u1',
    hostId: 'h1',
    gross: 80,
    callId: 'c1',
    reason: 'call_minute_c1',
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.txn.userBalanceAfter, 420);
    assert.equal(r.txn.coinsDeducted, 80);
    assert.equal(r.txn.coinsCreditedHost, 56);
    assert.equal(r.txn.coinsCreditedPlatform, 24);
    assert.equal(store.get('u1')!.coinBalance, 420);
    assert.equal(store.get('h1')!.coinBalance, 56);
    assert.equal(store.get(PLATFORM_TREASURY_ID)!.coinBalance, 24);
  }
}

// --- call + gift (rose 10) ---
{
  reset();
  seed('u1', 500);
  seed('h1', 0);
  const d = deps();
  transferUserToHost(d, {
    txnKey: 'call_c2_m1',
    type: 'call_minute',
    userId: 'u1',
    hostId: 'h1',
    gross: 80,
    callId: 'c2',
    reason: 'call',
  });
  const g = transferUserToHost(d, {
    txnKey: 'gift_c2_rose_1',
    type: 'gift',
    userId: 'u1',
    hostId: 'h1',
    gross: 10,
    callId: 'c2',
    giftId: 'rose',
    reason: 'gift',
  });
  assert.equal(g.ok, true);
  assert.equal(store.get('u1')!.coinBalance, 410); // 500-80-10
  assert.equal(store.get('h1')!.coinBalance, 56 + 7); // 70% of 80 + 70% of 10
  assert.equal(store.get(PLATFORM_TREASURY_ID)!.coinBalance, 24 + 3);
  const audit = auditConservation(dumpCoinTxns());
  assert.equal(audit.ok, true);
}

// --- idempotent replay ---
{
  reset();
  seed('u1', 500);
  seed('h1', 0);
  const d = deps();
  const a = transferUserToHost(d, {
    txnKey: 'dup_key',
    type: 'call_minute',
    userId: 'u1',
    hostId: 'h1',
    gross: 80,
    reason: 'x',
  });
  const b = transferUserToHost(d, {
    txnKey: 'dup_key',
    type: 'call_minute',
    userId: 'u1',
    hostId: 'h1',
    gross: 80,
    reason: 'x',
  });
  assert.equal(a.ok && b.ok, true);
  if (a.ok && b.ok) assert.equal(a.txn.id, b.txn.id);
  assert.equal(store.get('u1')!.coinBalance, 420);
}

// --- insufficient ---
{
  reset();
  seed('u1', 50);
  const d = deps();
  const r = transferUserToHost(d, {
    txnKey: 'poor',
    type: 'call_minute',
    userId: 'u1',
    hostId: 'h1',
    gross: 80,
    reason: 'x',
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, 402);
  assert.equal(store.get('u1')!.coinBalance, 50);
}

// --- mint + debit ---
{
  reset();
  seed('u1', 0);
  const d = deps();
  mintCoins(d, {
    txnKey: 'iap_1',
    type: 'purchase',
    userId: 'u1',
    amount: 500,
    reason: 'iap',
  });
  assert.equal(store.get('u1')!.coinBalance, 500);
  debitOnly(d, {
    txnKey: 'wd_1',
    type: 'withdrawal',
    userId: 'u1',
    amount: 100,
    reason: 'withdraw',
  });
  assert.equal(store.get('u1')!.coinBalance, 400);
}

// --- 5 and 10 minute calls ---
{
  reset();
  seed('u1', 1000);
  seed('h1', 0);
  const d = deps();
  for (let m = 1; m <= 5; m++) {
    transferUserToHost(d, {
      txnKey: `call_long_m${m}`,
      type: 'call_minute',
      userId: 'u1',
      hostId: 'h1',
      gross: 80,
      callId: 'long',
      reason: `m${m}`,
    });
  }
  assert.equal(store.get('u1')!.coinBalance, 1000 - 400);
  assert.equal(store.get('h1')!.coinBalance, 56 * 5);
  assert.equal(store.get(PLATFORM_TREASURY_ID)!.coinBalance, 24 * 5);

  for (let m = 6; m <= 10; m++) {
    transferUserToHost(d, {
      txnKey: `call_long_m${m}`,
      type: 'call_minute',
      userId: 'u1',
      hostId: 'h1',
      gross: 80,
      callId: 'long',
      reason: `m${m}`,
    });
  }
  assert.equal(store.get('u1')!.coinBalance, 1000 - 800);
  assert.equal(store.get('h1')!.coinBalance, 56 * 10);
}

console.log('coinLedger.test.ts: all scenarios passed');
