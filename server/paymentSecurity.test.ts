import assert from 'node:assert/strict';
import test from 'node:test';
import { getPaymentProduct, PAYMENT_PRODUCTS, publicPaymentCatalog } from './paymentCatalog.ts';
import { hashProviderToken } from './paymentStore.ts';
import { verifyStripeWebhook } from './stripePayments.ts';

test('authoritative catalog contains unique provider ids and never publishes a hard-coded price', () => {
  assert.equal(PAYMENT_PRODUCTS.length, 11);
  assert.equal(new Set(PAYMENT_PRODUCTS.map((p) => p.id)).size, PAYMENT_PRODUCTS.length);
  assert.equal(getPaymentProduct('luma_coins_1000')?.coins, 1000);
  assert.equal(getPaymentProduct('luma_coins_1000')?.bonusCoins, 120);
  for (const row of publicPaymentCatalog('google')) assert.equal(row.price, null);
});

test('purchase-token hashing is deterministic without persisting plaintext', () => {
  const token = 'secret-google-purchase-token';
  const digest = hashProviderToken(token);
  assert.equal(digest, hashProviderToken(token));
  assert.notEqual(digest, token);
  assert.equal(digest.length, 64);
});

test('invalid Stripe webhook signatures fail closed', () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_not_a_real_key';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
  assert.throws(() => verifyStripeWebhook(Buffer.from('{}'), 'invalid-signature'));
});
