/**
 * Runtime unit tests for gift catalog helpers (compiled via tsx from TS source).
 * Run: npx tsx scripts/test-host-gifts-runtime.mjs
 */
import assert from 'node:assert/strict';
import {
  ADULT_PHOTO_UNLOCK_MIN_COINS,
  GIFT_CATALOG,
  PHOTO_UNLOCK_MIN_COINS,
  adultGifts,
  giftsByCategory,
  resolveGift,
} from '../src/data/gifts.ts';

let pass = 0;
let fail = 0;
const rows = [];

function check(name, fn) {
  try {
    const detail = fn() || '';
    pass += 1;
    rows.push({ name, status: 'PASS', detail });
    console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    fail += 1;
    const detail = e instanceof Error ? e.message : String(e);
    rows.push({ name, status: 'FAIL', detail });
    console.log(`✗ ${name} — ${detail}`);
  }
}

check('GIFT_CATALOG has items', () => {
  assert.ok(GIFT_CATALOG.length >= 20);
  return `${GIFT_CATALOG.length} gifts`;
});

check('adultGifts returns only adult items', () => {
  const adults = adultGifts();
  assert.ok(adults.length === 8);
  assert.ok(adults.every((g) => g.isAdult === true));
  return `${adults.length} adult`;
});

check('giftsByCategory(standard) excludes adult', () => {
  const std = giftsByCategory('standard');
  assert.ok(std.every((g) => !g.isAdult));
  assert.ok(std.length >= 10);
  return `${std.length} standard`;
});

check('resolveGift aliases', () => {
  assert.equal(resolveGift('kiss')?.id, 'midnight_kiss');
  assert.equal(resolveGift('adult')?.id, 'private_unlock');
  assert.equal(resolveGift('spicy')?.id, 'spicy_rose');
  assert.equal(resolveGift('private')?.id, 'private_unlock');
  assert.equal(resolveGift('rose')?.id, 'rose_bouquet');
});

check('unlock coin floors', () => {
  assert.equal(PHOTO_UNLOCK_MIN_COINS, 99);
  assert.equal(ADULT_PHOTO_UNLOCK_MIN_COINS, 149);
  assert.ok(adultGifts().every((g) => g.coins >= ADULT_PHOTO_UNLOCK_MIN_COINS));
  assert.ok(adultGifts().every((g) => g.unlocksPhotos === true));
});

check('adult gift names are unique', () => {
  const names = adultGifts().map((g) => g.name);
  assert.equal(new Set(names).size, names.length);
});

console.log(`\nGift runtime: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
