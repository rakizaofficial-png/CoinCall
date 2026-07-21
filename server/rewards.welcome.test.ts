/**
 * Unit tests: new-user welcome is exact, capped, and never stacks extras.
 * Run: npx tsx server/rewards.welcome.test.ts
 */
import assert from 'node:assert/strict';
import {
  claimDailyLogin,
  claimReferralReward,
  claimSpin,
  getRewardStatus,
  resetRewardsForTests,
  resolveWelcomeGrant,
  welcomeBonusCoins,
  withClaimLock,
  MAX_WELCOME_BONUS_COINS,
} from './rewards.ts';
import {
  loadCoinTxns,
  mintCoins,
  type WalletLike,
} from './coinLedger.ts';

const store = new Map<string, WalletLike>();

function reset() {
  store.clear();
  loadCoinTxns([]);
  resetRewardsForTests();
  delete process.env.WELCOME_BONUS_COINS;
  delete process.env.REFERRAL_BONUS_COINS;
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

function createNewUser(userId: string, installId: string) {
  const grant = resolveWelcomeGrant({
    userId,
    installId,
    alreadyPaidUser: false,
    clientClaimed: false,
  });
  assert.equal(grant.granted, true);
  assert.ok(grant.coins > 0);
  assert.ok(grant.coins <= MAX_WELCOME_BONUS_COINS);
  const minted = mintCoins(deps(), {
    txnKey: `welcome:${userId}`,
    type: 'reward_welcome',
    userId,
    amount: grant.coins,
    reason: 'Welcome bonus',
  });
  assert.equal(minted.ok, true);
  if (!minted.ok) return 0;
  assert.equal(minted.txn.userBalanceBefore, 0);
  assert.equal(minted.txn.coinsMinted, grant.coins);
  assert.equal(minted.txn.userBalanceAfter, grant.coins);
  assert.equal(store.get(userId)!.coinBalance, grant.coins);
  return grant.coins;
}

// --- welcome amount from env, capped at 100 ---
{
  reset();
  process.env.WELCOME_BONUS_COINS = '60';
  assert.equal(welcomeBonusCoins(), 60);
  process.env.WELCOME_BONUS_COINS = '100';
  assert.equal(welcomeBonusCoins(), 100);
  process.env.WELCOME_BONUS_COINS = '999';
  assert.equal(welcomeBonusCoins(), 100);
  process.env.WELCOME_BONUS_COINS = '-5';
  assert.equal(welcomeBonusCoins(), 60);
  delete process.env.WELCOME_BONUS_COINS;
  assert.equal(welcomeBonusCoins(), 60);
}

// --- 10 brand-new accounts always get identical welcome ---
{
  reset();
  process.env.WELCOME_BONUS_COINS = '60';
  const amounts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const coins = createNewUser(`user_${i}`, `install_${i}`);
    amounts.push(coins);
  }
  assert.ok(amounts.every((c) => c === 60));
  assert.equal(new Set(amounts).size, 1);
}

// --- reinstall / second create: 0 welcome ---
{
  reset();
  process.env.WELCOME_BONUS_COINS = '60';
  const first = createNewUser('u_re', 'inst_re');
  assert.equal(first, 60);
  const again = resolveWelcomeGrant({
    userId: 'u_re',
    installId: 'inst_re',
    alreadyPaidUser: false,
    clientClaimed: false,
  });
  assert.equal(again.granted, false);
  assert.equal(again.coins, 0);
  // same install, new userId → still blocked
  const abuse = resolveWelcomeGrant({
    userId: 'u_re_new',
    installId: 'inst_re',
    alreadyPaidUser: false,
    clientClaimed: false,
  });
  assert.equal(abuse.granted, false);
}

// --- welcome txn idempotent ---
{
  reset();
  process.env.WELCOME_BONUS_COINS = '60';
  createNewUser('u_idemp', 'inst_idemp');
  const second = mintCoins(deps(), {
    txnKey: 'welcome:u_idemp',
    type: 'reward_welcome',
    userId: 'u_idemp',
    amount: 60,
    reason: 'Welcome bonus',
  });
  assert.equal(second.ok, true);
  assert.equal(store.get('u_idemp')!.coinBalance, 60);
}

// --- daily/spin/referral do NOT run on signup (balance stays welcome) ---
{
  reset();
  process.env.WELCOME_BONUS_COINS = '60';
  createNewUser('u_clean', 'inst_clean');
  assert.equal(store.get('u_clean')!.coinBalance, 60);
  const status = getRewardStatus('u_clean', 'inst_clean');
  assert.equal(status.welcomeClaimed, true);
  assert.equal(status.welcomeAmount, 60);
  // referral disabled by default
  const ref = claimReferralReward('u_clean', 'FRIEND99', 'inst_clean');
  assert.equal(ref.ok, false);
  assert.equal(store.get('u_clean')!.coinBalance, 60);
}

// --- daily uses stable txnKey; second claim fails ---
{
  reset();
  process.env.WELCOME_BONUS_COINS = '60';
  createNewUser('u_daily', 'inst_daily');
  const locked = withClaimLock('u_daily', () => {
    const result = claimDailyLogin('u_daily', 'inst_daily');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.txnKey, /^daily:u_daily:\d{4}-\d{2}-\d{2}$/);
    const minted = mintCoins(deps(), {
      txnKey: result.txnKey,
      type: 'reward_daily',
      userId: 'u_daily',
      amount: result.coins,
      reason: result.reason,
    });
    assert.equal(minted.ok, true);
  });
  assert.equal(locked.ok, true);
  assert.equal(store.get('u_daily')!.coinBalance, 80);
  const again = claimDailyLogin('u_daily', 'inst_daily');
  assert.equal(again.ok, false);
}

// --- spin stable keys ---
{
  reset();
  createNewUser('u_spin', 'inst_spin');
  const a = claimSpin('u_spin', 'inst_spin');
  assert.equal(a.ok, true);
  if (a.ok) {
    assert.match(a.txnKey, /^spin:u_spin:\d{4}-\d{2}-\d{2}:1$/);
    assert.ok(a.coins >= 30 && a.coins <= 35);
    mintCoins(deps(), {
      txnKey: a.txnKey,
      type: 'reward_spin',
      userId: 'u_spin',
      amount: a.coins,
      reason: a.reason,
    });
  }
  const b = claimSpin('u_spin', 'inst_spin');
  assert.equal(b.ok, true);
  if (b.ok) assert.match(b.txnKey, /:2$/);
}

// --- referral once when enabled ---
{
  reset();
  process.env.REFERRAL_BONUS_COINS = '40';
  createNewUser('u_ref', 'inst_ref');
  const r1 = claimReferralReward('u_ref', 'ABCD1234', 'inst_ref');
  assert.equal(r1.ok, true);
  if (r1.ok) {
    assert.equal(r1.coins, 40);
    assert.equal(r1.txnKey, 'referral:u_ref');
    mintCoins(deps(), {
      txnKey: r1.txnKey,
      type: 'reward_referral',
      userId: 'u_ref',
      amount: r1.coins,
      reason: r1.reason,
    });
  }
  assert.equal(store.get('u_ref')!.coinBalance, 100);
  const r2 = claimReferralReward('u_ref', 'OTHER999', 'inst_ref');
  assert.equal(r2.ok, false);
}

console.log('rewards.welcome.test.ts: all passed');
