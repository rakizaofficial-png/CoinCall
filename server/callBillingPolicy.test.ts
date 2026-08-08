import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIRST_CALL_CHARGE_DELAY_MS,
  RECURRING_CALL_CHARGE_MS,
  nextCallChargeAt,
} from './callBillingPolicy.ts';

test('first connected-call charge is due immediately at confirmed connection', () => {
  const connectedAt = 1_000_000;
  const dueAt = nextCallChargeAt(connectedAt, 0);
  assert.equal(dueAt - connectedAt, FIRST_CALL_CHARGE_DELAY_MS);
  assert.equal(dueAt, connectedAt);
});

test('later call charges remain one minute apart without drift', () => {
  const acceptedAt = 2_000_000;
  assert.equal(
    nextCallChargeAt(acceptedAt, 1) - nextCallChargeAt(acceptedAt, 0),
    RECURRING_CALL_CHARGE_MS,
  );
  assert.equal(
    nextCallChargeAt(acceptedAt, 9),
    acceptedAt + FIRST_CALL_CHARGE_DELAY_MS + 9 * RECURRING_CALL_CHARGE_MS,
  );
});
