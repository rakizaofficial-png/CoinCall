import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCoinTxns, type CoinTxn } from './coinLedger.ts';
import { ensureHostRecord, listHosts } from './hostManagement.ts';

function completedTxn(
  id: string,
  hostId: string,
  type: CoinTxn['type'],
  coins: number,
): CoinTxn {
  return {
    id,
    txnKey: `key_${id}`,
    type,
    status: 'completed',
    userId: `fan_${id}`,
    hostId,
    coinsDeducted: coins,
    coinsCreditedHost: coins,
    coinsCreditedPlatform: 0,
    coinsMinted: 0,
    userBalanceBefore: coins,
    userBalanceAfter: 0,
    hostBalanceBefore: 0,
    hostBalanceAfter: coins,
    commissionRate: 0,
    reason: type,
    createdAt: Date.now(),
  };
}

test('agency host metrics reconcile from the authoritative coin ledger', () => {
  const hostId = 'host_agency_revenue_test';
  ensureHostRecord(hostId, {
    name: 'Revenue Test Host',
    categories: ['Beauty', 'Live'],
    revenueGenerated: 2_200,
    revenueMonth: 1_800,
    callEarnings: 1_400,
    giftEarnings: 800,
    pendingEarnings: 2_200,
  });
  loadCoinTxns([
    completedTxn('call', hostId, 'call_minute', 70),
    completedTxn('gift', hostId, 'gift', 35),
    completedTxn('live', hostId, 'live_entry', 14),
  ]);

  const host = listHosts().find((row) => row.id === hostId);
  assert.ok(host);
  assert.equal(host.revenueGenerated, 119);
  assert.equal(host.revenueMonth, 119);
  assert.equal(host.callEarnings, 70);
  assert.equal(host.giftEarnings, 35);
  assert.equal(host.liveEarnings, 14);
  assert.equal(host.pendingEarnings, 119);
  assert.deepEqual(host.categories, ['Beauty', 'Live']);
});
