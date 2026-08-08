import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chargePerMinute,
  normalizePersistedHostRate,
  publicCallPricing,
} from './callPricing.ts';

test('host rate 3 is charged as 30 coins per billable minute', () => {
  assert.equal(chargePerMinute(3, 10), 30);
  assert.deepEqual(publicCallPricing(3), {
    hostRate: 3,
    rateUnitCoins: 10,
    chargePerMinute: 30,
  });
});

test('legacy 30/40 coin-per-minute records migrate to rate units', () => {
  assert.equal(normalizePersistedHostRate(30), 3);
  assert.equal(normalizePersistedHostRate(40), 4);
});

test('pricing is integer, positive, and bounded', () => {
  assert.equal(chargePerMinute(2.9, 10), 20);
  assert.equal(chargePerMinute(-1, 10), 30);
});
