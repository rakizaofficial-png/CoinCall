/**
 * Authoritative Luma engagement rewards.
 * Client never decides amounts — only requests a claim type.
 *
 * Signup: welcome only (≤100), once per userId + installId.
 * Daily / spin / referral: explicit claim endpoints — never auto on create.
 */

export const MAX_WELCOME_BONUS_COINS = 100;
export const DAILY_LOGIN_COINS = 20;
export const DAILY_LOGIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const SPIN_MIN_COINS = 30;
export const SPIN_MAX_COINS = 35;
export const MAX_SPINS_PER_DAY = 3;
export const MAX_REFERRAL_BONUS_COINS = 50;

/** Admin/env configured welcome — always clamped to [0, 100]. Default 60. */
export function welcomeBonusCoins(): number {
  const raw = Number(process.env.WELCOME_BONUS_COINS ?? 60);
  if (!Number.isFinite(raw) || raw < 0) return 60;
  return Math.min(MAX_WELCOME_BONUS_COINS, Math.floor(raw));
}

/** @deprecated use welcomeBonusCoins() — kept for import compatibility */
export const WELCOME_BONUS_COINS = 60;

/** Referral grant (explicit claim only). 0 = disabled. Capped at 50. */
export function referralBonusCoins(): number {
  const raw = Number(process.env.REFERRAL_BONUS_COINS ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(MAX_REFERRAL_BONUS_COINS, Math.floor(raw));
}

export type RewardClaimState = {
  userId: string;
  welcomeClaimedAt?: number;
  lastDailyAt?: number;
  lastSpinDay?: string; // YYYY-MM-DD UTC
  spinsToday?: number;
  referralClaimedAt?: number;
  referralCodeUsed?: string;
  installId?: string;
};

const claims = new Map<string, RewardClaimState>();
/** Install IDs that already received welcome — blocks reinstall farming */
const welcomeInstallIds = new Set<string>();
/** Per-user mutex for claim endpoints (prevents parallel double-mint) */
const claimBusy = new Set<string>();

export function utcDayKey(ts = Date.now()): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function ensureClaim(userId: string): RewardClaimState {
  let row = claims.get(userId);
  if (!row) {
    row = { userId };
    claims.set(userId, row);
  }
  return row;
}

/** Run claim body under a sync per-user lock. */
export function withClaimLock<T>(
  userId: string,
  fn: () => T,
): { ok: true; value: T } | { ok: false; error: string } {
  if (!userId) return { ok: false, error: 'userId required' };
  if (claimBusy.has(userId)) {
    return { ok: false, error: 'Reward claim already in progress — retry' };
  }
  claimBusy.add(userId);
  try {
    return { ok: true, value: fn() };
  } finally {
    claimBusy.delete(userId);
  }
}

export function dumpRewardsForSnapshot(): {
  claims: RewardClaimState[];
  welcomeInstallIds: string[];
} {
  return {
    claims: [...claims.values()],
    welcomeInstallIds: [...welcomeInstallIds],
  };
}

export function loadRewardsFromSnapshot(snap?: {
  claims?: RewardClaimState[];
  welcomeInstallIds?: string[];
} | null) {
  if (!snap) return;
  for (const row of snap.claims || []) {
    if (row?.userId) claims.set(row.userId, { ...row });
  }
  for (const id of snap.welcomeInstallIds || []) {
    if (id) welcomeInstallIds.add(String(id));
  }
}

/** Reset in-memory rewards (tests only). */
export function resetRewardsForTests() {
  claims.clear();
  welcomeInstallIds.clear();
  claimBusy.clear();
}

/** Mark welcome paid from legacy wallet path (keeps maps in sync). */
export function markWelcomeClaimed(userId: string, installId?: string) {
  const row = ensureClaim(userId);
  if (!row.welcomeClaimedAt) row.welcomeClaimedAt = Date.now();
  if (installId) {
    row.installId = installId;
    welcomeInstallIds.add(installId);
  }
  claims.set(userId, row);
}

export function hasWelcomeClaimed(userId: string, installId?: string): boolean {
  const row = claims.get(userId);
  if (row?.welcomeClaimedAt) return true;
  if (installId && welcomeInstallIds.has(installId)) return true;
  return false;
}

export function getRewardStatus(userId: string, installId?: string) {
  const row = ensureClaim(userId);
  const now = Date.now();
  const today = utcDayKey(now);
  if (row.lastSpinDay !== today) {
    row.spinsToday = 0;
    row.lastSpinDay = today;
  }
  const dailyReadyAt = (row.lastDailyAt || 0) + DAILY_LOGIN_COOLDOWN_MS;
  const dailyReady = !row.lastDailyAt || now >= dailyReadyAt;
  const welcomeDone =
    Boolean(row.welcomeClaimedAt) ||
    Boolean(installId && welcomeInstallIds.has(installId));
  const welcomeAmount = welcomeBonusCoins();

  return {
    welcomeClaimed: welcomeDone,
    welcomeAmount,
    dailyAmount: DAILY_LOGIN_COINS,
    dailyReady,
    dailyReadyAt: dailyReady ? null : dailyReadyAt,
    lastDailyAt: row.lastDailyAt || null,
    dailySecondsLeft: dailyReady
      ? 0
      : Math.max(0, Math.ceil((dailyReadyAt - now) / 1000)),
    spinsRemaining: Math.max(0, MAX_SPINS_PER_DAY - (row.spinsToday || 0)),
    spinsToday: row.spinsToday || 0,
    lastSpinDay: row.lastSpinDay || today,
    spinsMax: MAX_SPINS_PER_DAY,
    spinMin: SPIN_MIN_COINS,
    spinMax: SPIN_MAX_COINS,
    referralClaimed: Boolean(row.referralClaimedAt),
    referralAmount: referralBonusCoins(),
  };
}

export type ClaimOk = {
  ok: true;
  coins: number;
  reason: string;
  txnKey: string;
  status: ReturnType<typeof getRewardStatus>;
};

export type ClaimFail = {
  ok: false;
  error: string;
  status: ReturnType<typeof getRewardStatus>;
};

export function claimDailyLogin(
  userId: string,
  installId?: string,
): ClaimOk | ClaimFail {
  const status = getRewardStatus(userId, installId);
  if (!status.dailyReady) {
    return { ok: false, error: 'Daily reward already claimed — wait 24 hours', status };
  }
  const row = ensureClaim(userId);
  const now = Date.now();
  row.lastDailyAt = now;
  if (installId) row.installId = installId;
  claims.set(userId, row);
  const day = utcDayKey(now);
  return {
    ok: true,
    coins: DAILY_LOGIN_COINS,
    reason: 'Daily login reward',
    txnKey: `daily:${userId}:${day}`,
    status: getRewardStatus(userId, installId),
  };
}

export function claimSpin(
  userId: string,
  installId?: string,
): ClaimOk | ClaimFail {
  const status = getRewardStatus(userId, installId);
  if (status.spinsRemaining <= 0) {
    return {
      ok: false,
      error: 'No spins left today — come back tomorrow',
      status,
    };
  }
  const row = ensureClaim(userId);
  const today = utcDayKey();
  if (row.lastSpinDay !== today) {
    row.lastSpinDay = today;
    row.spinsToday = 0;
  }
  row.spinsToday = (row.spinsToday || 0) + 1;
  if (installId) row.installId = installId;
  claims.set(userId, row);

  const span = SPIN_MAX_COINS - SPIN_MIN_COINS + 1;
  const coins = SPIN_MIN_COINS + Math.floor(Math.random() * span);
  const spinIndex = row.spinsToday;
  return {
    ok: true,
    coins,
    reason: `Lucky Spin · ${coins}`,
    txnKey: `spin:${userId}:${today}:${spinIndex}`,
    status: getRewardStatus(userId, installId),
  };
}

/**
 * Explicit referral claim — never runs on signup.
 * Requires non-empty code ≠ self; once per userId.
 */
export function claimReferralReward(
  userId: string,
  code: string,
  installId?: string,
): ClaimOk | ClaimFail {
  const amount = referralBonusCoins();
  const status = getRewardStatus(userId, installId);
  if (amount <= 0) {
    return {
      ok: false,
      error: 'Referral rewards are disabled',
      status,
    };
  }
  if (status.referralClaimed) {
    return { ok: false, error: 'Referral already claimed', status };
  }
  const normalized = String(code || '')
    .trim()
    .toUpperCase()
    .slice(0, 32);
  if (!normalized || normalized.length < 4) {
    return { ok: false, error: 'Enter a valid invite code', status };
  }
  // Soft self-check: codes often embed user id fragments
  if (normalized.includes(userId.toUpperCase().slice(0, 8))) {
    return { ok: false, error: 'Cannot use your own invite code', status };
  }
  const row = ensureClaim(userId);
  row.referralClaimedAt = Date.now();
  row.referralCodeUsed = normalized;
  if (installId) row.installId = installId;
  claims.set(userId, row);
  return {
    ok: true,
    coins: amount,
    reason: 'Referral bonus',
    txnKey: `referral:${userId}`,
    status: getRewardStatus(userId, installId),
  };
}

/**
 * Decide welcome grant for new wallet creation.
 * Returns coins to grant (0 if blocked). Never stacks daily/spin/referral.
 */
export function resolveWelcomeGrant(input: {
  userId: string;
  installId?: string;
  alreadyPaidUser: boolean;
  clientClaimed: boolean;
}): { coins: number; granted: boolean } {
  const { userId, installId, alreadyPaidUser, clientClaimed } = input;
  if (
    alreadyPaidUser ||
    clientClaimed ||
    hasWelcomeClaimed(userId, installId)
  ) {
    markWelcomeClaimed(userId, installId);
    return { coins: 0, granted: false };
  }
  markWelcomeClaimed(userId, installId);
  const coins = welcomeBonusCoins();
  return { coins, granted: coins > 0 };
}

/**
 * Reasons that must NEVER go through open /wallet/credit.
 * Engagement coins only via /api/rewards/* or admin.
 */
export const ENGAGEMENT_CREDIT_BLOCK =
  /^(check-?in|daily|spin|lucky|welcome|referral|mission|achievement|vip|reward)/i;
