import assert from 'node:assert/strict';
import test from 'node:test';
import {
  availableAgencyCoins,
  collectedAgencyCoins,
  reservedAgencyCoins,
  type AgencyWithdrawalLedgerRow,
} from './agencyWithdrawalPolicy.ts';

test('agency can withdraw only host requests it has paid', () => {
  const rows: AgencyWithdrawalLedgerRow[] = [
    { kind: 'host', agencyId: 'a1', amountCoins: 700, status: 'agency_paid' },
    { kind: 'host', agencyId: 'a1', amountCoins: 400, status: 'agency_pending' },
    { kind: 'host', agencyId: 'a2', amountCoins: 900, status: 'agency_paid' },
  ];
  assert.equal(collectedAgencyCoins(rows, 'a1'), 700);
  assert.equal(availableAgencyCoins(rows, 'a1'), 700);
});

test('admin requests reserve agency coins and failed requests release them', () => {
  const rows: AgencyWithdrawalLedgerRow[] = [
    { kind: 'host', agencyId: 'a1', amountCoins: 1_800, status: 'agency_paid' },
    { kind: 'agency', agencyId: 'a1', amountCoins: 1_200, status: 'admin_review' },
    { kind: 'agency', agencyId: 'a1', amountCoins: 200, status: 'failed' },
  ];
  assert.equal(reservedAgencyCoins(rows, 'a1'), 1_200);
  assert.equal(availableAgencyCoins(rows, 'a1'), 600);
});
