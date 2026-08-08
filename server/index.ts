import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import agoraToken from 'agora-token';
import { createHash, randomUUID } from 'crypto';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  assertHostCanReceiveCalls,
  DEFAULT_HOST_CALL_PRICE,
  dumpManagedHostsForSnapshot,
  ensureHostRecord,
  getHost,
  listHosts,
  loadManagedHostsFromSnapshot,
  normalizeHostCallPrice,
  notifyHost,
  recordHostEarning,
  registerHostManagementRoutes,
} from './hostManagement.ts';
import { isPublicHttpAvatar, pickHostAvatarUrl } from './hostAvatar.ts';
import {
  getAgencyIdForHost,
  getAgency,
  findAgencyByLoginKey,
  linkDemoHostsIfEmpty,
  publicAgency,
  registerAgencyRoutes,
  resolveStaffAuth,
  getAgencyAuth,
  dumpAgenciesForSnapshot,
  loadAgenciesFromSnapshot,
} from './agencyManagement.ts';
import { registerVideoLibraryRoutes } from './videoLibrary.ts';
import {
  dumpHostAppUpdateForSnapshot,
  loadHostAppUpdateFromSnapshot,
  registerHostAppUpdateRoutes,
} from './hostAppUpdate.ts';
import {
  authenticateUserToken,
  bearerToken,
  dumpUserAccounts,
  getUserAccountById,
  loadUserAccounts,
  loginGoogleUser,
  loginUser,
  logoutUserToken,
  publicAuthUser,
  registerUser,
} from './userAuth.ts';
import { verifyGoogleFirebaseIdToken } from './firebaseIdToken.ts';
import { registerPaymentRoutes, type PaymentRequest } from './paymentRoutes.ts';
import { ensurePaymentIndexes } from './paymentStore.ts';
import {
  dumpHomeBannersForSnapshot,
  getHomeBanners,
  loadHomeBannersFromSnapshot,
  setHomeBanners,
} from './bannersStore.ts';
import {
  avatarPublicUrl,
  dumpAvatarsForSnapshot,
  hasStoredAvatar,
  hasStoredUserAvatar,
  isApiAvatarUrl,
  registerAvatarRoutes,
  resolveStoredOrHttpAvatar,
  restoreAvatarsFromSnapshot,
  saveHostAvatar,
  userAvatarPublicUrl,
} from './avatarStore.ts';
import {
  PLATFORM_TREASURY_ID,
  auditConservation,
  debitOnly,
  deriveWalletBalanceFromTxns,
  dumpCoinTxns,
  getCoinTxnByKey,
  listCoinTxns,
  loadCoinTxns,
  mintCoins,
  platformCommissionRate,
  reconcileWalletBalance,
  transferUserToHost,
  type CoinTxn,
} from './coinLedger.ts';
import { nextCallChargeAt, RECURRING_CALL_CHARGE_MS } from './callBillingPolicy.ts';
import { chargePerMinute, configureRateUnitCoins, publicCallPricing, rateUnitCoins } from './callPricing.ts';
import {
  availableAgencyCoins as calculateAgencyAvailableCoins,
  collectedAgencyCoins as calculateAgencyCollectedCoins,
  reservedAgencyCoins as calculateAgencyReservedCoins,
  rowKind as calculateWithdrawalKind,
} from './agencyWithdrawalPolicy.ts';
import {
  cancelPendingForUser,
  createAutoInvite,
  dumpAutoCallForSnapshot,
  expireStaleInvites,
  getAutoCallStatus,
  getPendingInvite,
  hostMayInviteUser,
  listDueAutoCallUsers,
  listAutoCallAnalytics,
  loadAutoCallFromSnapshot,
  markInvitePushed,
  pickAutoCallHost,
  respondAutoInvite,
  setAutoCallPrefs,
  touchAutoCallHeartbeat,
  type CandidateHost,
  type AutoCallAnalyticsEvent,
} from './autoCallInvites.ts';
import {
  claimDailyLogin,
  claimReferralReward,
  claimSpin,
  dumpRewardsForSnapshot,
  getRewardStatus,
  hasWelcomeClaimed,
  loadRewardsFromSnapshot,
  markWelcomeClaimed,
  resolveWelcomeGrant,
  welcomeBonusCoins,
  withClaimLock,
} from './rewards.ts';
import {
  loadWalletSnapshot,
  saveWalletSnapshot,
} from './persist.ts';
import {
  computeReadyToCall,
  getPresence,
  listPresence,
  presenceCountOnline,
  pruneHosts,
  removePresence,
  setPresence,
  upsertPresence,
  type HostPresence,
  type HostWorkspaceMode,
} from './presenceStore.ts';
import { loadSnapshot, scheduleSave, saveNow, type PersistedSnapshot } from './persistStore.ts';
import {
  closeMongo,
  initMongo,
  loadMongoSnapshot,
  mongoConfigured,
  persistenceLabel,
} from './mongoStore.ts';
import {
  issueStaffToken,
  requestStaffToken,
  verifyAdminCredentials,
  verifyStaffToken,
} from './staffAuth.ts';

const { RtcRole, RtcTokenBuilder, RtmTokenBuilder } = agoraToken as {
  RtcRole: { PUBLISHER: number; SUBSCRIBER: number };
  RtcTokenBuilder: {
    buildTokenWithUid: (
      appId: string,
      appCertificate: string,
      channelName: string,
      uid: number,
      role: number,
      tokenExpire: number,
      privilegeExpire: number,
    ) => string;
  };
  RtmTokenBuilder: {
    buildToken: (
      appId: string,
      appCertificate: string,
      userId: string,
      privilegeExpire: number,
    ) => string;
  };
};

const app = express();
app.use(cors());
// Host presence / live rooms used to POST huge data: avatar URLs — allow 2mb
app.use(express.json({
  limit: '3mb',
  verify: (req, _res, buffer) => {
    if (req.originalUrl.startsWith('/api/payments/stripe/webhook')) {
      (req as PaymentRequest).rawBody = Buffer.from(buffer);
    }
  },
}));

const APP_ID = process.env.AGORA_APP_ID || '';
const APP_CERT = process.env.AGORA_APP_CERTIFICATE || '';
const PORT = Number(process.env.PORT || 4000);
const ADMIN_KEY = process.env.ADMIN_API_KEY || 'coincall-admin';
const CALL_RING_TIMEOUT_MS = Math.min(120_000, Math.max(15_000, Number(process.env.CALL_RING_TIMEOUT_MS || 45_000)));
function isAdminCredential(value: unknown) {
  const credential = String(value || '').trim();
  return (
    credential === ADMIN_KEY ||
    verifyStaffToken(credential)?.kind === 'admin'
  );
}
if (!process.env.ADMIN_API_KEY) {
  console.warn(
    '[security] ADMIN_API_KEY unset — using demo default. Set a strong key before real money.',
  );
}

type CallStatus = 'ringing' | 'accepted' | 'rejected' | 'ended' | 'missed';

type CallRecord = {
  id: string;
  channel: string;
  hostId: string;
  hostName: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  ratePerMinute: number;
  status: CallStatus;
  createdAt: number;
  updatedAt: number;
  acceptedAt?: number;
  hostUidAgora: number;
  userUidAgora: number;
  giftRequest?: GiftRequestRecord | null;
  /** How many full minutes have been billed user → host */
  billedMinutes?: number;
  /** Set only after both authenticated Agora participants confirm the issued channel. */
  connectedAt?: number;
  rtcConnected?: Partial<Record<'user' | 'host', number>>;
  /** Final server-derived charge; never accepted from a client. */
  chargePerMinute?: number;
  endReason?: CallEndReason;
};

type CallEndReason =
  | 'user'
  | 'host'
  | 'exhausted'
  | 'missed'
  | 'rejected';

type CallHistoryRecord = {
  id: string;
  hostId: string;
  hostName: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  ratePerMinute: number;
  billedMinutes: number;
  coinsSpent: number;
  /** Net amount credited to the host after platform commission. */
  hostCoinsEarned?: number;
  platformCoins?: number;
  status: CallStatus;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  endReason: CallEndReason;
};

type GiftHistoryRecord = {
  id: string;
  fromUserId: string;
  fromName: string;
  toHostId: string;
  giftId: string;
  giftName: string;
  giftEmoji: string;
  coins: number;
  hostCoinsEarned?: number;
  platformCoins?: number;
  roomId?: string | null;
  callId?: string | null;
  createdAt: number;
};

type LiveSessionRecord = {
  id: string;
  hostId: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  giftCoins: number;
};

type GiftRequestStatus = 'pending' | 'accepted' | 'declined' | 'expired';

type GiftRequestRecord = {
  id: string;
  callId: string;
  hostId: string;
  hostName: string;
  userId: string;
  giftId: string;
  giftName: string;
  giftEmoji: string;
  coins: number;
  message?: string;
  status: GiftRequestStatus;
  createdAt: number;
  updatedAt: number;
};

const GIFT_CATALOG_SERVER: Record<
  string,
  { name: string; emoji: string; coins: number }
> = {
  // Micro gifts — fast, low-cost engagement
  coin: { name: 'Lucky Coin', emoji: '🪙', coins: 1 },
  single_rose: { name: 'Single Rose', emoji: '🌹', coins: 2 },
  heart_tap: { name: 'Heart Tap', emoji: '❤️', coins: 5 },
  applause: { name: 'Applause', emoji: '👏', coins: 8 },
  // Premium Glamour collection
  rose_bouquet: { name: 'Rose Bouquet', emoji: '🌹', coins: 10 },
  luxury_perfume: { name: 'Luxury Perfume', emoji: '🧴', coins: 50 },
  neon_heart: { name: 'Neon Heart', emoji: '💗', coins: 99 },
  golden_butterfly: { name: 'Golden Butterfly', emoji: '🦋', coins: 199 },
  diamond_ring: { name: 'Diamond Ring', emoji: '💍', coins: 299 },
  vip_champagne: { name: 'VIP Champagne', emoji: '🍾', coins: 399 },
  luxury_watch: { name: 'Luxury Watch', emoji: '⌚', coins: 599 },
  luxury_handbag: { name: 'Luxury Handbag', emoji: '👜', coins: 799 },
  fireworks: { name: 'Fireworks Celebration', emoji: '🎆', coins: 999 },
  sports_car: { name: 'Sports Car', emoji: '🏎️', coins: 1299 },
  super_bike: { name: 'Super Bike', emoji: '🏍️', coins: 1599 },
  diamond_crown: { name: 'Diamond Crown', emoji: '👑', coins: 1999 },
  red_carpet: { name: 'Red Carpet Entrance', emoji: '🎬', coins: 2499 },
  fashion_collection: { name: 'Fashion Collection', emoji: '👗', coins: 2999 },
  private_jet: { name: 'Private Jet', emoji: '✈️', coins: 4999 },
  luxury_yacht: { name: 'Luxury Yacht', emoji: '🛥️', coins: 6999 },
  royal_castle: { name: 'Royal Castle', emoji: '🏰', coins: 9999 },
  golden_throne: { name: 'Golden Throne', emoji: '🪑', coins: 12999 },
  diamond_rain: { name: 'Diamond Rain', emoji: '💎', coins: 15999 },
  millionaire_box: { name: 'Millionaire Box', emoji: '🎁', coins: 19999 },
  // Legacy aliases
  rose: { name: 'Rose Bouquet', emoji: '🌹', coins: 10 },
  heart: { name: 'Neon Heart', emoji: '💗', coins: 99 },
  kiss: { name: 'Neon Heart', emoji: '💗', coins: 99 },
  star: { name: 'Golden Butterfly', emoji: '🦋', coins: 199 },
  diamond: { name: 'Diamond Ring', emoji: '💍', coins: 299 },
  crown: { name: 'Diamond Crown', emoji: '👑', coins: 1999 },
  sports: { name: 'Sports Car', emoji: '🏎️', coins: 1299 },
  yacht: { name: 'Luxury Yacht', emoji: '🛥️', coins: 6999 },
  castle: { name: 'Royal Castle', emoji: '🏰', coins: 9999 },
  rocket: { name: 'Private Jet', emoji: '✈️', coins: 4999 },
};

type GiftCategory = 'popular' | 'vip' | 'mega';

const GIFT_MEDIA: Record<
  GiftCategory,
  { animationUrl: string; soundUrl: string }
> = {
  popular: {
    animationUrl: 'https://assets10.lottiefiles.com/packages/lf20_q5pk6p1k.json',
    soundUrl: 'https://actions.google.com/sounds/v1/cartoon/pop.ogg',
  },
  vip: {
    animationUrl: 'https://assets2.lottiefiles.com/packages/lf20_u4yrau.json',
    soundUrl: 'https://actions.google.com/sounds/v1/cartoon/magic_chime.ogg',
  },
  mega: {
    animationUrl: 'https://assets7.lottiefiles.com/packages/lf20_touohxv0.json',
    soundUrl:
      'https://actions.google.com/sounds/v1/transportation/sports_car_accelerating.ogg',
  },
};

function giftCategory(coins: number): GiftCategory {
  if (coins >= 1200) return 'mega';
  if (coins >= 250) return 'vip';
  return 'popular';
}

function giftMedia(coins: number) {
  const category = giftCategory(coins);
  return { category, ...GIFT_MEDIA[category] };
}

const calls = new Map<string, CallRecord>();
const callBillingTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Durable call archive (capped) */
const callHistory: CallHistoryRecord[] = [];
/** Durable gift ledger for host revenue (capped) */
const giftHistory: GiftHistoryRecord[] = [];
/** Durable live session ledger for host live-time stats */
const liveSessionHistory: LiveSessionRecord[] = [];

function archiveCall(call: CallRecord, endReason: CallEndReason) {
  if (callHistory.some((c) => c.id === call.id)) return;
  const startedAt = call.acceptedAt || call.createdAt;
  const endedAt = call.updatedAt || Date.now();
  const billingTxns = dumpCoinTxns().filter(
    (txn) =>
      txn.status === 'completed' &&
      txn.type === 'call_minute' &&
      txn.callId === call.id,
  );
  const billedMinutes = Math.max(
    Math.max(0, Math.floor(call.billedMinutes || 0)),
    billingTxns.length,
  );
  const rate = normalizeHostCallPrice(call.ratePerMinute);
  const row: CallHistoryRecord = {
    id: call.id,
    hostId: call.hostId,
    hostName: call.hostName,
    userId: call.userId,
    userName: call.userName,
    userAvatar: call.userAvatar,
    ratePerMinute: rate,
    billedMinutes,
    coinsSpent: billingTxns.length
      ? billingTxns.reduce((sum, txn) => sum + txn.coinsDeducted, 0)
      : billedMinutes * rate,
    hostCoinsEarned: billingTxns.reduce(
      (sum, txn) => sum + txn.coinsCreditedHost,
      0,
    ),
    platformCoins: billingTxns.reduce(
      (sum, txn) => sum + txn.coinsCreditedPlatform,
      0,
    ),
    status: call.status,
    startedAt,
    endedAt,
    durationSec: Math.max(0, Math.floor((endedAt - startedAt) / 1000)),
    endReason,
  };
  callHistory.unshift(row);
  if (callHistory.length > 800) callHistory.length = 800;
  persist();
}

function forceEndCall(call: CallRecord, endReason: CallEndReason) {
  clearCallBillingTimer(call.id);
  if (call.status === 'ended' || call.status === 'rejected' || call.status === 'missed') {
    archiveCall(call, call.endReason || endReason);
    return call;
  }
  call.status = 'ended';
  call.endReason = endReason;
  call.updatedAt = Date.now();
  calls.set(call.id, call);
  patchPresence(call.hostId, { isOnCall: false });
  archiveCall(call, endReason);
  pushToHost(call.hostId, 'call_ended', call);
  broadcastWs({ type: 'call:ended', payload: call });
  return call;
}

function clearCallBillingTimer(callId: string) {
  const timer = callBillingTimers.get(callId);
  if (timer) clearTimeout(timer);
  callBillingTimers.delete(callId);
}

function pushGiftHistory(event: GiftHistoryRecord) {
  giftHistory.unshift(event);
  if (giftHistory.length > 2000) giftHistory.length = 2000;
  persist();
}

function pushLiveSession(session: LiveSessionRecord) {
  if (liveSessionHistory.some((s) => s.id === session.id && s.endedAt === session.endedAt)) {
    return;
  }
  liveSessionHistory.unshift(session);
  if (liveSessionHistory.length > 800) liveSessionHistory.length = 800;
  persist();
}

function hostEarningTxns(hostId: string, startAt = 0) {
  return dumpCoinTxns().filter(
    (txn) =>
      txn.status === 'completed' &&
      txn.hostId === hostId &&
      txn.coinsCreditedHost > 0 &&
      txn.createdAt >= startAt &&
      (txn.type === 'call_minute' || txn.type === 'gift' || txn.type === 'live_entry'),
  );
}

function hostEarningsSummary(hostId: string) {
  const hostCalls = callHistory.filter((c) => c.hostId === hostId);
  const earnings = hostEarningTxns(hostId);
  const callTxns = earnings.filter((txn) => txn.type === 'call_minute');
  const giftTxns = earnings.filter((txn) => txn.type === 'gift');
  const liveTxns = earnings.filter((txn) => txn.type === 'live_entry');
  const callCoins = callTxns.reduce((sum, txn) => sum + txn.coinsCreditedHost, 0);
  const giftCoins = giftTxns.reduce((sum, txn) => sum + txn.coinsCreditedHost, 0);
  const liveCoins = liveTxns.reduce((sum, txn) => sum + txn.coinsCreditedHost, 0);
  const totalDurationSec = hostCalls.reduce((s, c) => s + c.durationSec, 0);
  const answeredCallIds = new Set(
    hostCalls
      .filter((c) => c.status === 'ended' || c.status === 'accepted' || c.billedMinutes > 0)
      .map((call) => call.id),
  );
  for (const txn of callTxns) if (txn.callId) answeredCallIds.add(txn.callId);
  return {
    callCoins,
    giftCoins,
    liveCoins,
    totalCoins: callCoins + giftCoins + liveCoins,
    totalCalls: answeredCallIds.size,
    totalDurationSec,
    totalGifts: giftTxns.length,
  };
}

/** Day-scoped dashboard stats (client passes local midnight as dayStartMs). */
function hostTodayStats(hostId: string, dayStartMs: number) {
  const start = Number.isFinite(dayStartMs) && dayStartMs > 0 ? dayStartMs : 0;
  const todayCalls = callHistory.filter(
    (c) =>
      c.hostId === hostId &&
      (c.endedAt || c.startedAt || 0) >= start &&
      (c.status === 'ended' || c.status === 'accepted' || (c.billedMinutes || 0) > 0),
  );
  const earnings = hostEarningTxns(hostId, start);
  const callTxns = earnings.filter((txn) => txn.type === 'call_minute');
  const giftTxns = earnings.filter((txn) => txn.type === 'gift');
  const liveEntryTxns = earnings.filter((txn) => txn.type === 'live_entry');
  const todayLiveSessions = liveSessionHistory.filter(
    (s) => s.hostId === hostId && (s.startedAt || 0) >= start,
  );
  const callCoins = callTxns.reduce((sum, txn) => sum + txn.coinsCreditedHost, 0);
  const giftCoins = giftTxns.reduce((sum, txn) => sum + txn.coinsCreditedHost, 0);
  const liveGiftCoins = giftTxns
    .filter((txn) => Boolean(txn.meta?.roomId))
    .reduce((sum, txn) => sum + txn.coinsCreditedHost, 0);
  const liveEntryCoins = liveEntryTxns.reduce(
    (sum, txn) => sum + txn.coinsCreditedHost,
    0,
  );
  const callMinutes = callTxns.length;
  const callIds = new Set(todayCalls.map((call) => call.id));
  for (const txn of callTxns) if (txn.callId) callIds.add(txn.callId);
  let liveSeconds = todayLiveSessions.reduce(
    (s, row) => s + Math.max(0, row.durationSec || 0),
    0,
  );
  return {
    callCoins,
    giftCoins,
    liveEntryCoins,
    liveGiftCoins,
    totalCoins: callCoins + giftCoins + liveEntryCoins,
    callsCount: callIds.size,
    callMinutes,
    giftCount: giftTxns.length,
    liveSeconds,
    liveSecondsCompleted: liveSeconds,
    liveActiveStartedAt: null as number | null,
    liveSessions: todayLiveSessions.length,
  };
}
const hostStreams = new Map<string, Set<express.Response>>();

function patchPresence(
  hostId: string,
  patch: Partial<HostPresence>,
): HostPresence | undefined {
  const current = getPresence(hostId);
  if (!current) return undefined;
  const next: HostPresence = {
    ...current,
    ...patch,
    id: hostId,
    lastSeen: patch.lastSeen ?? Date.now(),
  };
  next.readyToCall = computeReadyToCall(next);
  setPresence(hostId, next);
  return next;
}

function isListablePresence(h: HostPresence): boolean {
  if (!h.isOnline) return false;
  const gate = assertHostCanReceiveCalls(h.id);
  return gate.ok;
}

function requireUserMatch(req: express.Request, res: express.Response, userId: string): boolean {
  const headerId = String(req.headers['x-user-id'] || '').trim();
  const adminKeyHdr = String(req.headers['x-admin-key'] || req.query.key || '').trim();
  if (adminKeyHdr && isAdminCredential(adminKeyHdr)) return true;
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return false;
  }
  if (headerId && headerId === userId) {
    const registeredAccount = getUserAccountById(userId);
    if (!registeredAccount) return true;
    const account = authenticateUserToken(bearerToken(req.headers.authorization));
    if (account?.userId === userId) return true;
    res.status(401).json({ error: 'Valid account session required' });
    return false;
  }
  res.status(401).json({ error: 'X-User-Id must match userId (or admin key)' });
  return false;
}

/** Authorize a request against the immutable server call participants. */
function requireCallParticipant(
  req: express.Request,
  res: express.Response,
  call: CallRecord,
  requestedRole?: string,
): 'user' | 'host' | null {
  const claimed = String(req.headers['x-user-id'] || req.body?.userId || req.query.userId || '').trim();
  const role = requestedRole === 'host' ? 'host' : requestedRole === 'user' ? 'user' : undefined;
  const userMatch = claimed === call.userId;
  const hostMatch = claimed === call.hostId;
  if (!claimed || (!userMatch && !hostMatch) || (role === 'user' && !userMatch) || (role === 'host' && !hostMatch)) {
    res.status(403).json({ error: 'Only a participant in this call may perform this action' });
    return null;
  }
  if (!requireUserMatch(req, res, claimed)) return null;
  return userMatch ? 'user' : 'host';
}

/** Platform master key only — never accept agency login keys here */
function requireAdmin(req: express.Request, res: express.Response): boolean {
  const token = verifyStaffToken(requestStaffToken(req));
  const key = String(req.headers['x-admin-key'] || req.query.key || '');
  if (!isAdminCredential(key) && token?.kind !== 'admin') {
    res.status(401).json({ error: 'Unauthorized admin' });
    return false;
  }
  resolveStaffAuth(req, ADMIN_KEY);
  return true;
}

function isPlatformAdmin(req: express.Request): boolean {
  const key = String(req.headers['x-admin-key'] || req.query.key || '').trim();
  if (isAdminCredential(key)) return true;
  const auth = getAgencyAuth(req) || resolveStaffAuth(req, ADMIN_KEY);
  return auth?.kind === 'admin';
}

/** Platform admin OR active agency — binds agency identity server-side */
function requireStaff(req: express.Request, res: express.Response): boolean {
  const auth = resolveStaffAuth(req, ADMIN_KEY);
  if (!auth) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

function mintToken(channel: string, uid: number, roleName: string) {
  if (!APP_ID || !APP_CERT) {
    throw new Error('Agora server keys missing');
  }
  const role =
    roleName === 'subscriber' ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;
  const now = Math.floor(Date.now() / 1000);
  const privilegeExpire = now + 3600;
  const token = RtcTokenBuilder.buildTokenWithUid(
    APP_ID,
    APP_CERT,
    channel,
    uid,
    role,
    privilegeExpire,
    privilegeExpire,
  );
  return { appId: APP_ID, channel, uid, role: roleName, token, expireAt: privilegeExpire };
}

function mintRtmToken(userId: string) {
  if (!APP_ID || !APP_CERT) {
    throw new Error('Agora server keys missing');
  }
  const now = Math.floor(Date.now() / 1000);
  const privilegeExpire = now + 3600;
  const token = RtmTokenBuilder.buildToken(
    APP_ID,
    APP_CERT,
    userId,
    privilegeExpire,
  );
  return { appId: APP_ID, userId, token, expireAt: privilegeExpire };
}

function pushToHost(hostId: string, event: string, data: unknown) {
  const streams = hostStreams.get(hostId);
  if (!streams?.size) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of streams) {
    res.write(payload);
  }
}

setInterval(() => {
  pruneHosts();
  // Presence TTL deletions must also end live rooms (force-close / crash)
  for (const [id, room] of liveRooms) {
    if (!room?.isLive) continue;
    const hostId = String(room.hostId || room.id || '');
    if (hostId && !getPresence(hostId)) {
      endLiveRoomsForHost(hostId, 'presence_ttl');
    }
  }
  pruneZombieLiveRooms();
}, 10_000);

app.get('/api/health', (_req, res) => {
  pruneHosts();
  res.json({
    ok: true,
    agoraConfigured: Boolean(APP_ID && APP_CERT),
    onlineHosts: presenceCountOnline(),
    readyHosts: listPresence().filter((h) => h.readyToCall).length,
    activeCalls: [...calls.values()].filter(
      (c) => c.status === 'ringing' || c.status === 'accepted',
    ).length,
    realtime: 'ws',
    stack: 'express+ws+agora+firebase-storage+mongo-optional',
    persistence: persistenceLabel(),
    mongoConfigured: mongoConfigured(),
    managedHosts: listHosts().length,
    wallets: wallets.size,
    media: {
      hostPhotos: 'Firebase Storage (primary) → API disk avatar fallback',
      storageBucket:
        'Set EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET on host (project lovecall-2291e)',
    },
  });
});

/** Public gift catalog — User + Host must use the same IDs */
app.get('/api/gifts', (_req, res) => {
  const legacyAliases = new Set([
    'rose',
    'heart',
    'kiss',
    'star',
    'diamond',
    'crown',
    'sports',
    'yacht',
    'castle',
    'rocket',
  ]);
  const gifts = Object.entries(GIFT_CATALOG_SERVER)
    .filter(([id]) => !legacyAliases.has(id))
    .map(([id, g]) => ({
      id,
      name: g.name,
      emoji: g.emoji,
      coins: g.coins,
      ...giftMedia(g.coins),
    }))
    .sort((a, b) => a.coins - b.coins);
  res.json({ gifts });
});

function prepareUserAccount(
  account: { userId: string; displayName: string },
  grantWelcomeBonus: boolean,
) {
  const wallet = ensureWallet(account.userId, {
    role: 'user',
    displayName: account.displayName,
  });
  const welcomeAmount = Math.min(100, Math.max(0, welcomeBonusCoins()));
  if (grantWelcomeBonus && !hasWelcomeBonusAlready(account.userId) && welcomeAmount > 0) {
    const minted = mintCoins(coinDeps(), {
      txnKey: `welcome:${account.userId}`,
      type: 'reward_welcome',
      userId: account.userId,
      amount: welcomeAmount,
      reason: 'Welcome bonus',
    });
    if (minted.ok) {
      markWelcomeBonusPaid(account.userId);
      wallet.xp = Math.max(wallet.xp, 10);
      wallets.set(account.userId, wallet);
      broadcastWallet(account.userId);
    }
  }
  touchAutoCallHeartbeat({
    userId: account.userId,
    coinBalance: wallet.coinBalance,
    inCall: false,
  });
  return wallet;
}

/** Luma user email+password registration. */
app.post('/api/users/register', (req, res) => {
  const result = registerUser({
    email: String(req.body?.email || ''),
    password: String(req.body?.password || ''),
    displayName: String(req.body?.displayName || ''),
  });
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const { account } = result;
  prepareUserAccount(account, true);
  persist();
  res.status(201).json(publicAuthUser(account));
});

/** Luma user email+password login. */
app.post('/api/users/login', (req, res) => {
  const result = loginUser({
    email: String(req.body?.email || ''),
    password: String(req.body?.password || ''),
  });
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const { account } = result;
  prepareUserAccount(account, false);
  persist();
  res.json(publicAuthUser(account));
});

/** Google login/create-account via a server-verified Firebase ID token. */
app.post('/api/users/google', async (req, res) => {
  try {
    const identity = await verifyGoogleFirebaseIdToken(String(req.body?.idToken || ''));
    const result = loginGoogleUser(identity);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    prepareUserAccount(result.account, result.isNew);
    persist();
    res.status(result.isNew ? 201 : 200).json(publicAuthUser(result.account));
  } catch (error) {
    console.warn(
      '[userAuth] Google sign-in rejected:',
      error instanceof Error ? error.message : 'verification failed',
    );
    res.status(401).json({ error: 'Google sign-in could not be verified' });
  }
});

/** Validate the stored device session before allowing the protected app to mount. */
app.get('/api/users/session', (req, res) => {
  const userId = String(req.headers['x-user-id'] || '').trim();
  if (!requireUserMatch(req, res, userId)) return;
  const account = getUserAccountById(userId);
  if (!account) {
    res.status(401).json({ error: 'Account session not found' });
    return;
  }
  res.json(publicAuthUser(account, bearerToken(req.headers.authorization)));
});

/** Revoke only the current device session; other owned devices stay signed in. */
app.post('/api/users/logout', (req, res) => {
  const userId = String(req.body?.userId || req.headers['x-user-id'] || '').trim();
  if (!requireUserMatch(req, res, userId)) return;
  const token = bearerToken(req.headers.authorization);
  logoutUserToken(token);
  persist();
  res.json({ ok: true });
});

/**
 * GET /api/agora/token?channel=call_xyz&uid=0&role=publisher|subscriber
 */
app.get('/api/agora/token', (req, res) => {
  try {
    const channel = String(req.query.channel || '').trim();
    if (!channel) {
      res.status(400).json({ error: 'channel is required' });
      return;
    }
    const adminOk = isAdminCredential(
      req.query.key || req.headers['x-admin-key'],
    );
    // Participants receive scoped tokens from call/live authorization routes.
    // This generic endpoint remains only for tightly controlled operations.
    if (!adminOk) {
      res.status(403).json({ error: 'Use a scoped call or live token endpoint' });
      return;
    }
    const uid = Number(req.query.uid || 0);
    const roleName = String(req.query.role || 'publisher').toLowerCase();
    res.json(mintToken(channel, uid, roleName));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Token error' });
  }
});

/**
 * GET /api/agora/rtm-token?userId=user_xyz
 */
app.get('/api/agora/rtm-token', (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim().slice(0, 64);
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }
    if (!requireUserMatch(req, res, userId)) return;
    res.json(mintRtmToken(userId));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'RTM token error' });
  }
});

/** Host goes online / heartbeat */
app.post('/api/hosts/presence', (req, res) => {
  const {
    id,
    name,
    avatarUrl,
    photoUrl,
    country,
    ratePerMinute,
    isOnline = true,
    isLive = false,
    isOnCall = false,
    workspaceMode,
  } = req.body || {};

  if (!id || !name) {
    res.status(400).json({ error: 'id and name are required' });
    return;
  }

  const hostId = String(id);

  // Going offline always clears the bridge entry + any live rooms
  if (!isOnline) {
    removePresence(hostId);
    endLiveRoomsForHost(hostId, 'host_offline');
    broadcastWs({
      type: 'host:presence',
      payload: { id: hostId, isOnline: false, readyToCall: false, isLive: false, isOnCall: false },
    });
    res.json({ ok: true, host: { id: hostId, isOnline: false } });
    return;
  }

  const gate = assertHostCanReceiveCalls(hostId);
  if (!gate.ok) {
    removePresence(hostId);
    res.status(gate.status || 403).json({ error: gate.error, ok: false });
    return;
  }

  const prev = getPresence(hostId);
  const managed = getHost(hostId);

  // If host sends data:/blob:, persist on API and publish https URL for Luma
  let incomingRaw = avatarUrl ? String(avatarUrl) : photoUrl ? String(photoUrl) : '';
  if (
    incomingRaw &&
    (incomingRaw.startsWith('data:') || incomingRaw.startsWith('blob:'))
  ) {
    const saved = saveHostAvatar(hostId, incomingRaw);
    if (saved.ok && saved.url) incomingRaw = saved.url;
    else incomingRaw = '';
  }

  // Canonical field = avatarUrl; accept photoUrl alias. Never invent pravatar faces.
  // Prefer a file we actually have on disk — never keep a dead /avatar?v= link after redeploy.
  const incoming = pickHostAvatarUrl(
    {
      avatarUrl: incomingRaw || undefined,
      photoUrl: photoUrl && isPublicHttpAvatar(String(photoUrl))
        ? String(photoUrl)
        : undefined,
      photoUrls: managed?.photoUrls,
      hostAvatar: hasStoredAvatar(hostId)
        ? avatarPublicUrl(hostId, req)
        : undefined,
    },
    { hostId, name: String(name), allowDefault: false },
  );
  const prevUsable =
    prev?.avatarUrl &&
    !isApiAvatarUrl(prev.avatarUrl) &&
    isPublicHttpAvatar(prev.avatarUrl)
      ? String(prev.avatarUrl)
      : hasStoredAvatar(hostId)
        ? avatarPublicUrl(hostId, req)
        : '';
  const managedUsable =
    managed?.photoUrl &&
    !isApiAvatarUrl(managed.photoUrl) &&
    isPublicHttpAvatar(managed.photoUrl)
      ? String(managed.photoUrl)
      : '';
  const safeAvatar =
    resolveStoredOrHttpAvatar(
      hostId,
      [incoming, incomingRaw, photoUrl, prevUsable, managedUsable],
      req,
    ) || pickHostAvatarUrl({}, { hostId, name: String(name) });

  const mode: HostWorkspaceMode | undefined =
    workspaceMode === 'solo_calling' || workspaceMode === 'waiting_1v1'
      ? workspaceMode
      : undefined;

  const record: HostPresence = {
    id: hostId,
    name: String(name),
    avatarUrl: safeAvatar,
    country: country ? String(country) : undefined,
    ratePerMinute: normalizeHostCallPrice(
      managed?.callPrice ?? ratePerMinute ?? DEFAULT_HOST_CALL_PRICE,
    ),
    isOnline: true,
    isLive: Boolean(isLive),
    isOnCall: Boolean(isOnCall),
    readyToCall: false,
    workspaceMode: mode,
    hostStatus: gate.host?.hostStatus || 'approved',
    lastSeen: Date.now(),
  };
  record.readyToCall = computeReadyToCall(record);
  upsertPresence(record);

  // Keep admin registry photo in sync when host publishes a live https DP
  if (safeAvatar && managed && managed.photoUrl !== safeAvatar) {
    managed.photoUrl = safeAvatar;
    managed.photoUrls = [safeAvatar];
    managed.updatedAt = Date.now();
  }

  broadcastWs({
    type: 'host:presence',
    payload: {
      id: record.id,
      name: record.name,
      avatarUrl: record.avatarUrl,
      photoUrl: record.avatarUrl,
      isOnline: record.isOnline,
      isLive: record.isLive,
      isOnCall: record.isOnCall,
      readyToCall: record.readyToCall,
      workspaceMode: record.workspaceMode,
      lastSeen: record.lastSeen,
    },
  });

  res.json({ ok: true, host: record });
});

/** User app: list online CoinCall hosts */
app.get('/api/hosts', (req, res) => {
  pruneHosts();
  pruneZombieLiveRooms();
  const readyOnly =
    String(req.query.ready || '') === '1' ||
    String(req.query.ready || '').toLowerCase() === 'true';
  let list = listPresence().filter(isListablePresence);
  // Never list offline hosts
  list = list.filter((h) => h.isOnline);
  if (readyOnly) {
    list = list.filter((h) => h.readyToCall);
  }
  list = list.sort((a, b) => {
    if (a.readyToCall !== b.readyToCall) return Number(b.readyToCall) - Number(a.readyToCall);
    return Number(b.isLive) - Number(a.isLive);
  });
  // Never hand Luma a /avatar URL that 404s after disk wipe
  const hosts = list.map((h) => {
    const managed = getHost(h.id);
    const avatarUrl =
      resolveStoredOrHttpAvatar(
        h.id,
        [h.avatarUrl, managed?.photoUrl, ...(managed?.photoUrls || [])],
        req,
      ) || pickHostAvatarUrl({}, { hostId: h.id, name: h.name });
    return { ...h, avatarUrl };
  });
  res.json({ hosts });
});

/** Single host profile (works even if briefly offline) */
app.get('/api/hosts/:hostId/profile', (req, res) => {
  const hostId = String(req.params.hostId || '').trim();
  if (!hostId) {
    res.status(400).json({ error: 'hostId required' });
    return;
  }
  const presence = getPresence(hostId);
  const managed = getHost(hostId);
  const avatarUrl =
    resolveStoredOrHttpAvatar(
      hostId,
      [
        presence?.avatarUrl,
        managed?.photoUrl,
        ...(managed?.photoUrls || []),
      ],
      req,
    ) ||
    pickHostAvatarUrl({}, { hostId, name: presence?.name || managed?.name || 'Host' });
  res.json({
    host: {
      id: hostId,
      name: presence?.name || managed?.name || 'Host',
      avatarUrl,
      country: presence?.country || managed?.country,
      ratePerMinute: normalizeHostCallPrice(
        managed?.callPrice ?? presence?.ratePerMinute,
      ),
      isOnline: Boolean(presence?.isOnline),
      isLive: Boolean(presence?.isLive),
      isOnCall: Boolean(presence?.isOnCall),
      readyToCall: Boolean(presence?.readyToCall),
      bio: managed?.bio || '',
      photoUrls: managed?.photoUrls || [],
      languages: managed?.languages || [],
      categories: managed?.categories || [],
      videoUrl: managed?.videoUrl,
    },
  });
});

/**
 * Host app: update public profile (DP URLs, name, bio, rates).
 * Auth: X-User-Id must match hostId. Persists to managed registry (+ Mongo/disk).
 * Binary photos stay in Firebase Storage — this route stores https URLs only.
 */
function handleHostProfileUpdate(req: express.Request, res: express.Response) {
  const hostId = String(req.params.hostId || '').trim();
  if (!hostId) {
    res.status(400).json({ error: 'hostId required' });
    return;
  }
  if (!requireUserMatch(req, res, hostId)) return;

  const body = req.body || {};
  const name = String(body.name || '').trim();
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const photoUrls = Array.isArray(body.photoUrls)
    ? body.photoUrls.map(String).filter(Boolean).slice(0, 12)
    : undefined;
  const photoUrl = body.photoUrl ? String(body.photoUrl) : photoUrls?.[0];
  const patch: Record<string, unknown> = { name };
  if (body.bio != null) patch.bio = String(body.bio).trim();
  if (body.country != null) patch.country = String(body.country).trim();
  if (photoUrl) patch.photoUrl = photoUrl;
  if (photoUrls) patch.photoUrls = photoUrls;
  if (body.videoUrl != null) patch.videoUrl = String(body.videoUrl);
  if (Array.isArray(body.languages)) patch.languages = body.languages.map(String);
  if (Array.isArray(body.categories)) {
    patch.categories = body.categories.map(String);
  }
  const managed = ensureHostRecord(
    hostId,
    patch as Parameters<typeof ensureHostRecord>[1],
  );
  persist();

  const presence = getPresence(hostId);
  if (presence?.isOnline) {
    const avatarUrl =
      resolveStoredOrHttpAvatar(
        hostId,
        [managed.photoUrl, ...(managed.photoUrls || []), presence.avatarUrl],
        req,
      ) || presence.avatarUrl;
    const next = {
      ...presence,
      name: managed.name,
      avatarUrl,
      country: managed.country || presence.country,
      ratePerMinute: normalizeHostCallPrice(
        managed.callPrice ?? presence.ratePerMinute,
      ),
      lastSeen: Date.now(),
    };
    next.readyToCall = computeReadyToCall(next);
    upsertPresence(next);
    broadcastWs({
      type: 'host:presence',
      payload: {
        id: next.id,
        name: next.name,
        avatarUrl: next.avatarUrl,
        photoUrl: next.avatarUrl,
        isOnline: next.isOnline,
        isLive: next.isLive,
        isOnCall: next.isOnCall,
        readyToCall: next.readyToCall,
        workspaceMode: next.workspaceMode,
        ratePerMinute: next.ratePerMinute,
        lastSeen: next.lastSeen,
      },
    });
  }

  const avatarUrl =
    resolveStoredOrHttpAvatar(
      hostId,
      [managed.photoUrl, ...(managed.photoUrls || [])],
      req,
    ) || pickHostAvatarUrl({}, { hostId, name: managed.name });

  res.json({
    ok: true,
    host: {
      id: hostId,
      name: managed.name,
      avatarUrl,
      country: managed.country,
      ratePerMinute: normalizeHostCallPrice(managed.callPrice),
      bio: managed.bio || '',
      photoUrls: managed.photoUrls || [],
      languages: managed.languages || [],
      categories: managed.categories || [],
      videoUrl: managed.videoUrl,
      isOnline: Boolean(presence?.isOnline),
    },
  });
}

app.put('/api/hosts/:hostId/profile', handleHostProfileUpdate);
app.post('/api/hosts/:hostId/profile', handleHostProfileUpdate);

/** Register Expo/FCM push token for host notifications */
const hostPushTokens = new Map<string, { token: string; platform: string; updatedAt: number; categories: string[] }>();

app.post('/api/hosts/:hostId/push-token', (req, res) => {
  const hostId = String(req.params.hostId || '').trim();
  if (!hostId) {
    res.status(400).json({ error: 'hostId required' });
    return;
  }
  if (!requireUserMatch(req, res, hostId)) return;
  const token = String(req.body?.token || '').trim();
  if (!token) {
    res.status(400).json({ error: 'token required' });
    return;
  }
  hostPushTokens.set(hostId, {
    token,
    platform: String(req.body?.platform || 'unknown'),
    updatedAt: Date.now(),
    categories: Array.isArray(req.body?.categories)
      ? req.body.categories.map(String)
      : ['chat', 'call', 'gift', 'coin', 'withdrawal', 'announcement', 'live'],
  });
  persist();
  res.json({ ok: true });
});

app.get('/api/hosts/:hostId/push-token', (req, res) => {
  const hostId = String(req.params.hostId || '').trim();
  const row = hostPushTokens.get(hostId);
  res.json({ ok: true, registered: Boolean(row), token: row || null });
});

/** Host SSE stream for incoming user calls */
app.get('/api/hosts/:hostId/stream', (req, res) => {
  const hostId = String(req.params.hostId);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  if (!hostStreams.has(hostId)) hostStreams.set(hostId, new Set());
  hostStreams.get(hostId)!.add(res);

  res.write(`event: connected\ndata: ${JSON.stringify({ hostId })}\n\n`);

  // Replay ringing calls for this host
  for (const call of calls.values()) {
    if (call.hostId === hostId && call.status === 'ringing') {
      res.write(`event: incoming_call\ndata: ${JSON.stringify(call)}\n\n`);
    }
  }

  const heartbeat = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    hostStreams.get(hostId)?.delete(res);
  });
});

/** User rings a host */
app.post('/api/calls', (req, res) => {
  pruneHosts();
  const { hostId, userId, userName, userAvatar } = req.body || {};
  if (!hostId || !userId || !userName) {
    res.status(400).json({ error: 'hostId, userId, userName required' });
    return;
  }
  if (!requireUserMatch(req, res, String(userId))) return;

  const hid = String(hostId);
  const gate = assertHostCanReceiveCalls(hid);
  if (!gate.ok) {
    res.status(gate.status || 403).json({ error: gate.error });
    return;
  }

  if (!assertUserAccountActive(String(userId), res)) return;

  const host = getPresence(hid);
  if (!host || !host.isOnline) {
    res.status(404).json({ error: 'Host is offline. Ask them to Go Online in CoinCall.' });
    return;
  }
  if (host.isOnCall || !host.readyToCall) {
    res.status(409).json({
      error: 'Host is busy on another call',
    });
    return;
  }

  const rate = normalizeHostCallPrice(host.ratePerMinute);
  const pricing = publicCallPricing(rate);
  const userWallet = ensureWallet(String(userId), {
    role: 'user',
    displayName: String(userName),
  });
  if (userWallet.coinBalance < pricing.chargePerMinute) {
    res.status(402).json({
      error: 'Insufficient balance, please recharge',
      need: pricing.chargePerMinute,
      wallet: walletPublic(userWallet),
    });
    return;
  }

  const id = randomUUID().slice(0, 12);
  const call: CallRecord = {
    id,
    channel: `coincall_${id}`,
    hostId: host.id,
    hostName: host.name,
    userId: String(userId),
    userName: String(userName),
    userAvatar: userAvatar ? String(userAvatar) : undefined,
    ratePerMinute: rate,
    chargePerMinute: pricing.chargePerMinute,
    status: 'ringing',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hostUidAgora: 200000 + Math.floor(Math.random() * 9000),
    userUidAgora: 100000 + Math.floor(Math.random() * 9000),
  };

  calls.set(id, call);
  patchPresence(host.id, { isOnCall: true });
  // Enrich SSE payload for host incoming UI (coins / country)
  pushToHost(host.id, 'incoming_call', {
    ...call,
    userCoinBalance: userWallet.coinBalance,
    userCountry: String(req.body?.userCountry || userWallet.country || ''),
  });
  cancelPendingForUser(String(userId), 'user_started_call');
  touchAutoCallHeartbeat({
    userId: String(userId),
    coinBalance: userWallet.coinBalance,
    inCall: true,
  });

  // Auto-miss after the server-authoritative ring window.
  setTimeout(() => {
    const current = calls.get(id);
    if (current?.status === 'ringing') {
      current.status = 'missed';
      current.endReason = 'missed';
      current.updatedAt = Date.now();
      calls.set(id, current);
      patchPresence(current.hostId, { isOnCall: false });
      archiveCall(current, 'missed');
      pushToHost(current.hostId, 'call_missed', current);
    }
  }, CALL_RING_TIMEOUT_MS);

  res.status(201).json({ call });
});

app.get('/api/calls/:id', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  res.json({ call });
});

app.post('/api/calls/:id/accept', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  if (!requireCallParticipant(req, res, call, 'host')) return;
  if (call.status === 'accepted') {
    scheduleNextCallCharge(call);
    res.json({ call });
    return;
  }
  if (call.status !== 'ringing') {
    res.status(409).json({ error: `Call is ${call.status}` });
    return;
  }
  call.status = 'accepted';
  call.acceptedAt = Date.now();
  call.updatedAt = Date.now();
  calls.set(call.id, call);
  scheduleNextCallCharge(call);
  pushToHost(call.hostId, 'call_accepted', call);
  broadcastWs({ type: 'call:updated', payload: call });
  res.json({ call });
});

app.post('/api/calls/:id/reject', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  if (!requireCallParticipant(req, res, call, 'host')) return;
  call.status = 'rejected';
  clearCallBillingTimer(call.id);
  call.endReason = 'rejected';
  call.updatedAt = Date.now();
  calls.set(call.id, call);
  patchPresence(call.hostId, { isOnCall: false });
  archiveCall(call, 'rejected');
  pushToHost(call.hostId, 'call_rejected', call);
  res.json({ call });
});

app.post('/api/calls/:id/end', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  if (!requireCallParticipant(req, res, call)) return;
  const reasonRaw = String(req.body?.reason || '').trim();
  const endReason: CallEndReason =
    reasonRaw === 'exhausted'
      ? 'exhausted'
      : reasonRaw === 'host'
        ? 'host'
        : 'user';
  const ended = forceEndCall(call, endReason);
  res.json({ call: ended });
});

type CallBillingResult =
  | {
      ok: true;
      duplicate: boolean;
      txn?: CoinTxn;
      billedMinutes: number;
      userWallet: WalletRow;
      hostWallet: WalletRow;
    }
  | {
      ok: false;
      code: number;
      error: string;
      billedMinutes: number;
      userWallet: WalletRow;
    };

function callBillingTxn(callId: string, minuteIndex: number): CoinTxn | undefined {
  return (
    getCoinTxnByKey(`call_minute:${callId}:${minuteIndex}`) ||
    dumpCoinTxns().find(
      (txn) =>
        txn.status === 'completed' &&
        txn.type === 'call_minute' &&
        txn.callId === callId &&
        Number(txn.meta?.billedMinute) === minuteIndex,
    )
  );
}

/** Single authoritative call charge shared by the timer and HTTP retry route. */
function billAcceptedCall(call: CallRecord, minuteIndex: number): CallBillingResult {
  const billed = Math.max(0, Math.floor(call.billedMinutes || 0));
  const nextMinute = Math.max(1, Math.floor(minuteIndex));
  const userWallet = ensureWallet(call.userId, {
    role: 'user',
    displayName: call.userName,
  });

  if (call.status !== 'accepted' || !call.connectedAt) {
    return {
      ok: false,
      code: 409,
      error: call.connectedAt ? `Call is ${call.status}` : 'Call media is not connected',
      billedMinutes: billed,
      userWallet,
    };
  }

  if (nextMinute <= billed) {
    return {
      ok: true,
      duplicate: true,
      txn: callBillingTxn(call.id, nextMinute),
      billedMinutes: billed,
      userWallet,
      hostWallet: ensureWallet(call.hostId, { role: 'host' }),
    };
  }
  if (nextMinute !== billed + 1) {
    return {
      ok: false,
      code: 409,
      error: `Expected minute ${billed + 1}, got ${nextMinute}`,
      billedMinutes: billed,
      userWallet,
    };
  }
  if (userWallet.accountStatus === 'banned' || userWallet.accountStatus === 'suspended') {
    return {
      ok: false,
      code: 403,
      error: userWallet.accountStatus === 'banned' ? 'Account banned' : 'Account suspended',
      billedMinutes: billed,
      userWallet,
    };
  }

  const amount = chargePerMinute(call.ratePerMinute);
  if (userWallet.coinBalance < amount) {
    return {
      ok: false,
      code: 402,
      error: 'Coins exhausted',
      billedMinutes: billed,
      userWallet,
    };
  }

  const result = transferUserToHost(coinDeps(), {
    txnKey: `call_minute:${call.id}:${nextMinute}`,
    type: 'call_minute',
    userId: call.userId,
    hostId: call.hostId,
    gross: amount,
    callId: call.id,
    reason: `call_minute_${call.id}`,
    meta: { billedMinute: nextMinute, hostRate: call.ratePerMinute, chargePerMinute: amount },
  });
  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      error: result.txn.error || 'Billing failed',
      billedMinutes: billed,
      userWallet: ensureWallet(call.userId),
    };
  }

  call.billedMinutes = nextMinute;
  call.updatedAt = Date.now();
  calls.set(call.id, call);
  persist();

  const hostWallet = ensureWallet(call.hostId, { role: 'host' });
  recordHostEarning(call.hostId, result.txn.coinsCreditedHost, {
    kind: 'call',
    coinBalance: hostWallet.coinBalance,
    incrementCalls: nextMinute === 1,
    broadcast: broadcastWs,
  });
  broadcastWallet(call.userId);
  broadcastWallet(call.hostId);
  pushToHost(call.hostId, 'call_minute', {
    callId: call.id,
    amount: result.txn.coinsCreditedHost,
    gross: result.txn.coinsDeducted,
    platformCut: result.txn.coinsCreditedPlatform,
    billedMinutes: nextMinute,
    hostWallet: walletPublic(hostWallet),
    txnId: result.txn.id,
  });

  return {
    ok: true,
    duplicate: false,
    txn: result.txn,
    billedMinutes: nextMinute,
    userWallet: ensureWallet(call.userId),
    hostWallet,
  };
}

function scheduleNextCallCharge(call: CallRecord) {
  clearCallBillingTimer(call.id);
  if (call.status !== 'accepted' || !call.connectedAt) return;
  const scheduledMinute = Math.max(0, Math.floor(call.billedMinutes || 0)) + 1;
  const dueAt = nextCallChargeAt(call.connectedAt, scheduledMinute - 1);
  const timer = setTimeout(() => {
    callBillingTimers.delete(call.id);
    const current = calls.get(call.id);
    if (!current || current.status !== 'accepted') return;
    if ((current.billedMinutes || 0) >= scheduledMinute) {
      scheduleNextCallCharge(current);
      return;
    }
    const billed = billAcceptedCall(current, scheduledMinute);
    if (!billed.ok) {
      console.warn(`[callBilling] ending ${current.id}: ${billed.error}`);
      forceEndCall(current, 'exhausted');
      return;
    }
    scheduleNextCallCharge(current);
  }, Math.max(0, dueAt - Date.now()));
  callBillingTimers.set(call.id, timer);
}

/**
 * Bill one call minute: deduct rate from user, credit host (net of platform cut).
 * Idempotent via the server-owned txnKey = callId:minuteN.
 */
app.post('/api/calls/:id/minute', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  if (call.status !== 'accepted') {
    res.status(409).json({ error: `Call is ${call.status}` });
    return;
  }
  const userId = String(req.body?.userId || req.headers['x-user-id'] || '').trim();
  if (!userId || userId !== call.userId) {
    res.status(403).json({ error: 'Only the caller can bill this call' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  if (!assertUserAccountActive(userId, res)) return;

  const expectedMinute = (call.billedMinutes || 0) + 1;
  const requestedMinute = Math.floor(Number(req.body?.minuteIndex) || 0);
  const nextMinute = requestedMinute > 0 ? requestedMinute : expectedMinute;
  const result = billAcceptedCall(call, nextMinute);
  if (!result.ok) {
    if (result.code === 402 || result.code === 403) forceEndCall(call, 'exhausted');
    res.status(result.code).json({
      error: result.error,
      billedMinutes: result.billedMinutes,
      need: chargePerMinute(call.ratePerMinute),
      callEnded: result.code === 402 || result.code === 403,
      userWallet: walletPublic(result.userWallet),
      wallet: walletPublic(result.userWallet),
    });
    return;
  }

  // A client retry may win before the server timer. Always reschedule from the
  // accepted timestamp so the next charge remains exactly one minute later.
  scheduleNextCallCharge(call);
  res.json({
    ok: true,
    amount: result.txn?.coinsDeducted ?? chargePerMinute(call.ratePerMinute),
    hostCredited: result.txn?.coinsCreditedHost ?? 0,
    platformCut: result.txn?.coinsCreditedPlatform ?? 0,
    commissionRate: result.txn?.commissionRate ?? platformCommissionRate(),
    billedMinutes: result.billedMinutes,
    duplicate: result.duplicate,
    txn: result.txn,
    userWallet: walletPublic(result.userWallet),
    hostWallet: walletPublic(result.hostWallet),
  });
});

/** Lookup user/host profile by public 6-digit appId */
app.get('/api/profiles/search', (req, res) => {
  const appId = String(req.query.appId || req.query.q || '')
    .trim()
    .replace(/\D/g, '');
  if (!/^\d{6}$/.test(appId)) {
    res.status(400).json({ error: 'Enter a 6-digit appId' });
    return;
  }
  for (const w of wallets.values()) {
    if (w.appId === appId) {
      res.json({
        profile: {
          userId: w.userId,
          appId: w.appId,
          displayName: w.displayName,
          avatarUrl: w.avatarUrl,
          role: w.role,
        },
      });
      return;
    }
  }
  res.status(404).json({ error: 'User not found' });
});

/** User call history */
app.get('/api/users/:userId/calls', (req, res) => {
  const userId = String(req.params.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const callsForUser = callHistory.filter((c) => c.userId === userId).slice(0, limit);
  res.json({
    calls: callsForUser,
    summary: {
      totalCalls: callsForUser.length,
      totalCoinsSpent: callsForUser.reduce((s, c) => s + c.coinsSpent, 0),
      totalDurationSec: callsForUser.reduce((s, c) => s + c.durationSec, 0),
    },
  });
});

/** Host call analytics + history */
app.get('/api/hosts/:hostId/calls', (req, res) => {
  const hostId = String(req.params.hostId || '').trim();
  if (!hostId) {
    res.status(400).json({ error: 'hostId required' });
    return;
  }
  if (!requireUserMatch(req, res, hostId)) return;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const callsForHost = callHistory.filter((c) => c.hostId === hostId).slice(0, limit);
  const summary = hostEarningsSummary(hostId);
  res.json({
    calls: callsForHost,
    summary: {
      totalCalls: summary.totalCalls,
      totalDurationSec: summary.totalDurationSec,
      totalCallCoins: summary.callCoins,
    },
  });
});

/** Host revenue breakdown: calls + gifts with sender detail */
app.get('/api/hosts/:hostId/earnings', (req, res) => {
  const hostId = String(req.params.hostId || '').trim();
  if (!hostId) {
    res.status(400).json({ error: 'hostId required' });
    return;
  }
  if (!requireUserMatch(req, res, hostId)) return;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
  const dayStartMs = Number(req.query.dayStart) || 0;
  const monthStartMs = Number(req.query.monthStart) || 0;
  const summary = hostEarningsSummary(hostId);
  const today = hostTodayStats(hostId, dayStartMs);
  const month = hostMonthStats(hostId, monthStartMs);
  const callsForHost = callHistory.filter((c) => c.hostId === hostId).slice(0, limit);
  const giftsForHost = giftHistory.filter((g) => g.toHostId === hostId).slice(0, limit);
  const wallet = ensureWallet(hostId, { role: 'host' });
  const liveAll = liveSessionHistory.filter((s) => s.hostId === hostId);
  res.json({
    summary: {
      ...summary,
      walletBalance: wallet.coinBalance,
      followers: followerCount(hostId),
      liveSessions: liveAll.length,
      liveSeconds: liveAll.reduce((s, row) => s + Math.max(0, row.durationSec || 0), 0),
    },
    today: {
      ...today,
      walletBalance: wallet.coinBalance,
      dayStartMs: dayStartMs || undefined,
    },
    month,
    calls: callsForHost,
    gifts: giftsForHost,
  });
});

/** Follow / unfollow a host (Luma users) */
app.post('/api/hosts/:hostId/follow', (req, res) => {
  const hostId = String(req.params.hostId || '').trim();
  const userId = String(req.body?.userId || req.headers['x-user-id'] || '').trim();
  const follow = req.body?.follow !== false;
  if (!hostId || !userId) {
    res.status(400).json({ error: 'hostId and userId required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  let set = hostFollowers.get(hostId);
  if (!set) {
    set = new Set();
    hostFollowers.set(hostId, set);
  }
  if (follow) set.add(userId);
  else set.delete(userId);
  persist();
  res.json({ ok: true, following: follow, followers: set.size });
});

app.get('/api/hosts/:hostId/followers', (req, res) => {
  const hostId = String(req.params.hostId || '').trim();
  if (!hostId) {
    res.status(400).json({ error: 'hostId required' });
    return;
  }
  res.json({ hostId, followers: followerCount(hostId) });
});

/** Token helper for a call participant */
app.get('/api/calls/:id/token', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  if (call.status !== 'accepted' && call.status !== 'ringing') {
    res.status(409).json({ error: `Call is ${call.status}` });
    return;
  }
  const role = String(req.query.role || 'user');
  if (!requireCallParticipant(req, res, call, role)) return;
  const uid = role === 'host' ? call.hostUidAgora : call.userUidAgora;
  try {
    const token = mintToken(call.channel, uid, 'publisher');
    res.json({ ...token, call });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Token error' });
  }
});

/**
 * Clients can report an Agora join only for their own participant identity.
 * The backend starts billing exactly once after both reports are present.
 */
app.post('/api/calls/:id/rtc-connected', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  if (call.status !== 'accepted') {
    res.status(409).json({ error: `Call is ${call.status}` });
    return;
  }
  const role = String(req.body?.role || '').toLowerCase();
  const participant = requireCallParticipant(req, res, call, role);
  if (!participant) return;
  const connected = { ...(call.rtcConnected || {}) };
  connected[participant] ||= Date.now();
  call.rtcConnected = connected;
  if (!call.connectedAt && connected.user && connected.host) {
    call.connectedAt = Math.max(connected.user, connected.host);
    call.updatedAt = Date.now();
    calls.set(call.id, call);
    scheduleNextCallCharge(call);
    broadcastWs({ type: 'call:connected', payload: { callId: call.id, connectedAt: call.connectedAt } });
  } else {
    calls.set(call.id, call);
  }
  persist();
  res.json({ ok: true, callId: call.id, participant, connectedAt: call.connectedAt || null, waitingFor: call.connectedAt ? [] : (connected.user ? ['host'] : connected.host ? ['user'] : ['user', 'host']) });
});

/** Host asks user for a gift during an active call */
app.post('/api/calls/:id/gift-requests', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  if (call.status !== 'accepted') {
    res.status(409).json({ error: 'Call must be active to request a gift' });
    return;
  }
  if (call.giftRequest?.status === 'pending') {
    res.status(409).json({ error: 'A gift request is already pending', giftRequest: call.giftRequest });
    return;
  }

  const giftId = String(req.body?.giftId || '').trim();
  const catalog = GIFT_CATALOG_SERVER[giftId];
  if (!catalog) {
    res.status(400).json({ error: 'Invalid giftId', gifts: Object.keys(GIFT_CATALOG_SERVER) });
    return;
  }

  const giftRequest: GiftRequestRecord = {
    id: randomUUID().slice(0, 10),
    callId: call.id,
    hostId: call.hostId,
    hostName: call.hostName,
    userId: call.userId,
    giftId,
    giftName: catalog.name,
    giftEmoji: catalog.emoji,
    coins: catalog.coins,
    message: String(req.body?.message || `${call.hostName} would love a ${catalog.name}!`),
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  call.giftRequest = giftRequest;
  call.updatedAt = Date.now();
  calls.set(call.id, call);

  broadcastWs({
    type: 'gift:request',
    payload: giftRequest,
  });
  pushToHost(call.hostId, 'gift_request_sent', giftRequest);

  // Auto-expire after 90s
  setTimeout(() => {
    const current = calls.get(call.id);
    if (current?.giftRequest?.id === giftRequest.id && current.giftRequest.status === 'pending') {
      current.giftRequest.status = 'expired';
      current.giftRequest.updatedAt = Date.now();
      current.updatedAt = Date.now();
      calls.set(current.id, current);
      broadcastWs({ type: 'gift:expired', payload: current.giftRequest });
      pushToHost(current.hostId, 'gift_request_expired', current.giftRequest);
    }
  }, 90_000);

  res.status(201).json({ ok: true, giftRequest, call });
});

/** User (or host) reads pending gift request on a call */
app.get('/api/calls/:id/gift-requests/pending', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  const gr = call.giftRequest;
  if (!gr || gr.status !== 'pending') {
    res.json({ giftRequest: null });
    return;
  }
  res.json({ giftRequest: gr });
});

/** User accepts or declines a host gift request */
app.post('/api/calls/:id/gift-requests/:reqId/respond', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  const gr = call.giftRequest;
  if (!gr || gr.id !== String(req.params.reqId)) {
    res.status(404).json({ error: 'Gift request not found' });
    return;
  }
  if (gr.status !== 'pending') {
    res.status(409).json({ error: `Request already ${gr.status}`, giftRequest: gr });
    return;
  }

  const action = String(req.body?.action || '').toLowerCase();
  const userId = String(req.body?.userId || call.userId).trim();
  if (!requireUserMatch(req, res, userId)) return;

  if (action === 'decline' || action === 'reject') {
    gr.status = 'declined';
    gr.updatedAt = Date.now();
    call.giftRequest = gr;
    call.updatedAt = Date.now();
    calls.set(call.id, call);
    broadcastWs({ type: 'gift:declined', payload: gr });
    pushToHost(call.hostId, 'gift_request_declined', gr);
    res.json({ ok: true, giftRequest: gr });
    return;
  }

  if (action !== 'accept') {
    res.status(400).json({ error: 'action must be accept or decline' });
    return;
  }

  // Deduct from user → host net + platform (idempotent)
  const giftTxnKey =
    String(req.headers['idempotency-key'] || req.body?.txnKey || '').trim() ||
    `gift_req:${call.id}:${gr.id}`;
  const xfer = transferUserToHost(coinDeps(), {
    txnKey: giftTxnKey,
    type: 'gift',
    userId,
    hostId: call.hostId,
    gross: gr.coins,
    callId: call.id,
    giftId: gr.giftId,
    reason: `gift_to_${call.hostId}_${gr.giftId}`,
  });
  if (!xfer.ok) {
    res.status(xfer.code).json({
      error: xfer.txn.error || 'Insufficient coins',
      need: gr.coins,
      wallet: walletPublic(ensureWallet(userId)),
      giftRequest: gr,
      txn: xfer.txn,
    });
    return;
  }

  const userWallet = ensureWallet(userId);
  const hostWallet = ensureWallet(call.hostId);

  recordHostEarning(call.hostId, xfer.txn.coinsCreditedHost, {
    kind: 'gift',
    coinBalance: hostWallet.coinBalance,
    broadcast: broadcastWs,
  });

  gr.status = 'accepted';
  gr.updatedAt = Date.now();
  call.giftRequest = gr;
  call.updatedAt = Date.now();
  calls.set(call.id, call);

  const payload = {
    ...gr,
    fromUserId: userId,
    fromUserName: call.userName,
    hostCredited: xfer.txn.coinsCreditedHost,
    platformCut: xfer.txn.coinsCreditedPlatform,
    hostWallet: walletPublic(hostWallet),
    userWallet: walletPublic(userWallet),
    txnId: xfer.txn.id,
  };

  recordGiftDm({
    userId,
    userName: call.userName,
    hostId: call.hostId,
    giftId: gr.giftId,
    giftName: gr.giftName,
    giftEmoji: gr.giftEmoji,
    giftCoins: gr.coins,
    txnId: xfer.txn.id,
  });
  pushGiftHistory({
    id: gr.id,
    fromUserId: userId,
    fromName: call.userName,
    toHostId: call.hostId,
    giftId: gr.giftId,
    giftName: gr.giftName,
    giftEmoji: gr.giftEmoji,
    coins: gr.coins,
    hostCoinsEarned: xfer.txn.coinsCreditedHost,
    platformCoins: xfer.txn.coinsCreditedPlatform,
    callId: call.id,
    roomId: null,
    createdAt: Date.now(),
  });

  broadcastWs({
    type: 'gift:accepted',
    payload,
  });
  pushToHost(call.hostId, 'gift_request_accepted', payload);

  res.json({ ok: true, giftRequest: gr, hostWallet: walletPublic(hostWallet), userWallet: walletPublic(userWallet) });
});

/** User sends a gift to a host during live or call (spend + credit + notify). */
app.post('/api/gifts/send', (req, res) => {
  const userId = String(req.body?.userId || '').trim();
  const hostId = String(req.body?.hostId || '').trim();
  const giftId = String(req.body?.giftId || '').trim();
  const roomId = req.body?.roomId ? String(req.body.roomId).trim() : undefined;
  const callId = req.body?.callId ? String(req.body.callId).trim() : undefined;
  const userName = String(req.body?.userName || 'Fan').slice(0, 40);

  if (!userId || !hostId || !giftId) {
    res.status(400).json({ error: 'userId, hostId, giftId required' });
    return;
  }
  if (userId === hostId) {
    res.status(403).json({ error: 'Hosts cannot gift themselves!' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;

  const catalog = GIFT_CATALOG_SERVER[giftId];
  if (!catalog) {
    res.status(400).json({ error: 'Invalid giftId', gifts: Object.keys(GIFT_CATALOG_SERVER) });
    return;
  }

  const giftEventId = randomUUID().slice(0, 10);
  const txnKey =
    String(
      req.headers['idempotency-key'] ||
        req.body?.txnKey ||
        req.body?.clientTxId ||
        '',
    ).trim() ||
    `gift_send:${userId}:${hostId}:${giftId}:${giftEventId}`;
  const existingTxn = getCoinTxnByKey(txnKey);

  const xfer = transferUserToHost(coinDeps(), {
    txnKey,
    type: 'gift',
    userId,
    hostId,
    gross: catalog.coins,
    callId: callId || undefined,
    giftId,
    reason: `gift_to_${hostId}_${giftId}`,
    meta: { roomId, userName },
  });
  if (!xfer.ok) {
    res.status(xfer.code).json({
      error: xfer.txn.error || 'Insufficient coins',
      need: catalog.coins,
      wallet: walletPublic(ensureWallet(userId)),
      txn: xfer.txn,
    });
    return;
  }

  const userWallet = ensureWallet(userId);
  const hostWallet = ensureWallet(hostId);

  // An idempotent HTTP retry returns the original transaction without
  // crediting earnings, room totals, history or realtime events a second time.
  if (existingTxn?.status === 'completed') {
    res.status(200).json({
      ok: true,
      replayed: true,
      txn: xfer.txn,
      userWallet: walletPublic(userWallet),
      hostWallet: walletPublic(hostWallet),
    });
    return;
  }

  recordHostEarning(hostId, xfer.txn.coinsCreditedHost, {
    kind: 'gift',
    coinBalance: hostWallet.coinBalance,
    broadcast: broadcastWs,
  });

  const giftEvent = {
    id: giftEventId,
    roomId: roomId || null,
    callId: callId || null,
    fromUserId: userId,
    fromName: userName,
    toHostId: hostId,
    giftId,
    giftName: catalog.name,
    giftEmoji: catalog.emoji,
    coins: catalog.coins,
    ...giftMedia(catalog.coins),
    hostCredited: xfer.txn.coinsCreditedHost,
    platformCut: xfer.txn.coinsCreditedPlatform,
    combo: 1,
    createdAt: Date.now(),
    txnId: xfer.txn.id,
    roomGiftCoins: undefined as number | undefined,
  };

  const resolvedRoom = roomId ? findLiveRoom(roomId) : findLiveRoom(hostId);
  if (resolvedRoom) {
    const room = resolvedRoom.room;
    room.giftCoins = Number(room.giftCoins || 0) + catalog.coins;
    giftEvent.roomGiftCoins = room.giftCoins;
    room.updatedAt = Date.now();
    liveRooms.set(resolvedRoom.id, room);
    pushLiveComment(resolvedRoom.id, {
      userId,
      userName,
      text: `sent ${catalog.name}`,
      kind: 'gift',
      giftEmoji: catalog.emoji,
      giftCoins: catalog.coins,
    });
    giftEvent.roomId = resolvedRoom.id;
  }

  recordGiftDm({
    userId,
    userName,
    hostId,
    giftId,
    giftName: catalog.name,
    giftEmoji: catalog.emoji,
    giftCoins: catalog.coins,
    txnId: xfer.txn.id,
    createdAt: giftEvent.createdAt,
  });
  broadcastWs({ type: 'gift:received', payload: giftEvent });
  pushToHost(hostId, 'live_gift', giftEvent);
  pushGiftHistory({
    id: giftEvent.id,
    fromUserId: giftEvent.fromUserId,
    fromName: giftEvent.fromName,
    toHostId: giftEvent.toHostId,
    giftId: giftEvent.giftId,
    giftName: giftEvent.giftName,
    giftEmoji: giftEvent.giftEmoji,
    coins: giftEvent.coins,
    hostCoinsEarned: xfer.txn.coinsCreditedHost,
    platformCoins: xfer.txn.coinsCreditedPlatform,
    roomId: giftEvent.roomId,
    callId: giftEvent.callId,
    createdAt: giftEvent.createdAt,
  });

  broadcastWallet(userId);
  broadcastWallet(hostId);

  res.status(201).json({
    ok: true,
    gift: giftEvent,
    txn: xfer.txn,
    userWallet: walletPublic(userWallet),
    hostWallet: walletPublic(hostWallet),
  });
});

app.post('/api/admin/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const roleWanted = String(req.body?.role || 'super_admin');

  if (!verifyAdminCredentials(email, password)) {
    res.status(401).json({ ok: false, error: 'Invalid email or password' });
    return;
  }
  const allowed = ['super_admin', 'moderator', 'finance', 'support'];
  const role = allowed.includes(roleWanted) ? roleWanted : 'super_admin';
  res.json({
    ok: true,
    token: issueStaffToken({ kind: 'admin', role }),
    role,
    roles: allowed,
    adminId: String(req.body?.adminId || 'admin'),
  });
});

app.get('/api/admin/health', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ ok: true, agoraConfigured: Boolean(APP_ID && APP_CERT) });
});

/**
 * AI / Prerecorded Host Database
 * Link cloud clips via AI_HOST_CDN env (S3/GCS/R2):
 *   ${AI_HOST_CDN}/${host_id}/intro.mp4
 *   ${AI_HOST_CDN}/${host_id}/loop.mp4
 *   ${AI_HOST_CDN}/${host_id}/avatar.jpg
 */
const AI_HOST_CDN = (process.env.AI_HOST_CDN || '').replace(/\/$/, '');
const DEMO_INTRO =
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4';
const DEMO_LOOP =
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4';

type AiHostRow = {
  host_id: string;
  name: string;
  avatar: string;
  video_url_1: string;
  video_url_2: string;
  age: number;
  cost_per_minute: number;
};

function aiClip(hostId: string, file: 'intro' | 'loop', demo: string) {
  if (!AI_HOST_CDN) return demo;
  return `${AI_HOST_CDN}/${hostId}/${file}.mp4`;
}

function aiAvatar(hostId: string, n?: number) {
  if (AI_HOST_CDN) return `${AI_HOST_CDN}/${hostId}/avatar.jpg`;
  const i = n && n >= 1 && n <= 7 ? n : 1;
  return `https://luma-user.onrender.com/hosts/asian/${String(i).padStart(2, '0')}.png`;
}

const AI_HOST_TABLE: AiHostRow[] = [
  {
    host_id: 'ai_yuna',
    name: 'Yuna',
    avatar: aiAvatar('ai_yuna', 1),
    video_url_1: aiClip('ai_yuna', 'intro', DEMO_INTRO),
    video_url_2: aiClip('ai_yuna', 'loop', DEMO_LOOP),
    age: 22,
    cost_per_minute: 80,
  },
  {
    host_id: 'ai_mei',
    name: 'Mei',
    avatar: aiAvatar('ai_mei', 2),
    video_url_1: aiClip('ai_mei', 'intro', DEMO_INTRO),
    video_url_2: aiClip('ai_mei', 'loop', DEMO_LOOP),
    age: 24,
    cost_per_minute: 85,
  },
  {
    host_id: 'ai_aya',
    name: 'Aya',
    avatar: aiAvatar('ai_aya', 3),
    video_url_1: aiClip('ai_aya', 'intro', DEMO_INTRO),
    video_url_2: aiClip('ai_aya', 'loop', DEMO_LOOP),
    age: 23,
    cost_per_minute: 75,
  },
  {
    host_id: 'ai_hana',
    name: 'Hana',
    avatar: aiAvatar('ai_hana', 4),
    video_url_1: aiClip('ai_hana', 'intro', DEMO_INTRO),
    video_url_2: aiClip('ai_hana', 'loop', DEMO_LOOP),
    age: 21,
    cost_per_minute: 70,
  },
  {
    host_id: 'ai_rin',
    name: 'Rin',
    avatar: aiAvatar('ai_rin', 5),
    video_url_1: aiClip('ai_rin', 'intro', DEMO_INTRO),
    video_url_2: aiClip('ai_rin', 'loop', DEMO_LOOP),
    age: 25,
    cost_per_minute: 90,
  },
  {
    host_id: 'ai_sora',
    name: 'Sora',
    avatar: aiAvatar('ai_sora', 6),
    video_url_1: aiClip('ai_sora', 'intro', DEMO_INTRO),
    video_url_2: aiClip('ai_sora', 'loop', DEMO_LOOP),
    age: 22,
    cost_per_minute: 80,
  },
  {
    host_id: 'ai_lina',
    name: 'Lina',
    avatar: aiAvatar('ai_lina', 7),
    video_url_1: aiClip('ai_lina', 'intro', DEMO_INTRO),
    video_url_2: aiClip('ai_lina', 'loop', DEMO_LOOP),
    age: 24,
    cost_per_minute: 85,
  },
];

function pickAiHost(requestedId: string): AiHostRow {
  const legacy: Record<string, string> = {
    ai_mira: 'ai_yuna',
    ai_sofia: 'ai_mei',
    ai_elena: 'ai_rin',
  };
  const id = legacy[requestedId] || requestedId;
  const direct = AI_HOST_TABLE.find((h) => h.host_id === id);
  if (direct) return direct;
  let hash = 0;
  for (let i = 0; i < requestedId.length; i++) {
    hash = (hash + requestedId.charCodeAt(i) * (i + 1)) % AI_HOST_TABLE.length;
  }
  return AI_HOST_TABLE[hash]!;
}

/** List AI host catalog */
app.get('/api/ai-hosts', (_req, res) => {
  res.json({
    hosts: AI_HOST_TABLE,
    cdn: AI_HOST_CDN || null,
    note: 'Set AI_HOST_CDN to your cloud bucket root for production clips',
  });
});

/**
 * Call routing decision:
 * - If 0 real hosts online → AI fallback
 * - If requested host online → agora_live
 * - Else → AI fallback for seamless UX
 */
app.post('/api/calls/route', (req, res) => {
  pruneHosts();
  const requestedHostId = String(req.body?.hostId || '').trim();
  if (!requestedHostId) {
    res.status(400).json({ error: 'hostId required' });
    return;
  }

  const online = listPresence().filter(
    (h) => isListablePresence(h) && h.readyToCall,
  );
  const matched = online.find((h) => h.id === requestedHostId) || null;

  if (matched) {
    res.json({
      ok: true,
      decision: {
        transport: 'agora_live',
        reason: 'Requested host is online — Agora bridge',
        realHostsOnline: online.length,
        aiHost: null,
        liveHostId: matched.id,
      },
    });
    return;
  }

  const aiHost = pickAiHost(requestedHostId);
  res.json({
    ok: true,
    decision: {
      transport: 'ai_prerecorded',
      reason:
        online.length === 0
          ? 'Zero real hosts online — AI Host Database fallback'
          : 'Requested host unavailable — AI fallback',
      realHostsOnline: online.length,
      aiHost,
      liveHostId: null,
    },
  });
});

/**
 * =============================================================================
 * WALLET / IAP / WITHDRAWALS / WEBSOCKET
 * =============================================================================
 * Replace in-memory `wallets` Map with Postgres when DATABASE_URL is set.
 * Google Play purchases are verified through Android Publisher before minting.
 * Apple purchases still require App Store Server API configuration.
 * =============================================================================
 */

type WalletRow = {
  userId: string;
  coinBalance: number;
  xp: number;
  isPremium: boolean;
  displayName: string;
  country?: string;
  avatarUrl?: string;
  bio?: string;
  role: 'user' | 'host';
  /** Public 6-digit search id (e.g. "583920") */
  appId?: string;
  /** Account gate for Luma users / hosts mirrored in wallet */
  accountStatus?: 'active' | 'suspended' | 'banned';
  /** One-time welcome bonus already paid (survives wallet recreate) */
  welcomeBonusGranted?: boolean;
};

/** installId → canonical userId so profile survives WebView storage clears / reinstall */
const installUserMap = new Map<string, string>();

type WithdrawalRequest = {
  id: string;
  kind?: 'host' | 'agency';
  hostId: string;
  hostName?: string;
  hostAvatar?: string;
  amountCoins: number;
  gateway: 'easypaisa' | 'jazzcash' | 'bank';
  accountName: string;
  accountNumber: string;
  status:
    | 'pending'
    | 'processing'
    | 'paid'
    | 'failed'
    | 'admin_review'
    | 'agency_pending'
    | 'agency_processing'
    | 'agency_paid'
    | 'agency_rejected';
  createdAt: number;
  agencyId?: string;
  agencyName?: string;
  collectedHostWithdrawalIds?: string[];
  /** Immutable audit snapshot taken immediately before/after the debit. */
  walletBalanceBefore?: number;
  walletBalanceAfter?: number;
  totalCallsAtRequest?: number;
  answeredCallsAtRequest?: number;
  missedCallsAtRequest?: number;
  totalCallSecondsAtRequest?: number;
  callCoinsAtRequest?: number;
  giftCoinsAtRequest?: number;
  lifetimeEarningsAtRequest?: number;
  providerRef?: string;
  error?: string;
};

type ReportRow = {
  id: string;
  reporterId: string;
  reporterName: string;
  targetId: string;
  reason: string;
  details: string;
  createdAt: number;
  status: 'open' | 'resolved';
};

type LedgerEntry = {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  kind: 'credit' | 'spend';
  at: number;
};

const wallets = new Map<string, WalletRow>();
const walletLedger = new Map<string, LedgerEntry[]>();
const withdrawals: WithdrawalRequest[] = [];
const reports: ReportRow[] = [];

function withdrawalKind(row: WithdrawalRequest): 'host' | 'agency' {
  return calculateWithdrawalKind(row);
}

function agencyCollectedCoins(agencyId: string): number {
  return calculateAgencyCollectedCoins(withdrawals, agencyId);
}

function agencyReservedCoins(agencyId: string): number {
  return calculateAgencyReservedCoins(withdrawals, agencyId);
}

function agencyAvailableCoins(agencyId: string): number {
  return calculateAgencyAvailableCoins(withdrawals, agencyId);
}

const iapReceipts = new Set<string>();
/** Survives wallet map wipe: never grant welcome twice for same userId */
const welcomeBonusPaidIds = new Set<string>();

/** Host follower graph: hostId → Set of userIds */
const hostFollowers = new Map<string, Set<string>>();

function markWelcomeBonusPaid(userId: string, installId?: string) {
  welcomeBonusPaidIds.add(userId);
  markWelcomeClaimed(userId, installId);
  const row = wallets.get(userId);
  if (row) {
    row.welcomeBonusGranted = true;
    wallets.set(userId, row);
  }
}

function hasWelcomeBonusAlready(userId: string, installId?: string): boolean {
  if (welcomeBonusPaidIds.has(userId)) return true;
  if (hasWelcomeClaimed(userId, installId)) {
    welcomeBonusPaidIds.add(userId);
    return true;
  }
  const row = wallets.get(userId);
  if (row?.welcomeBonusGranted) {
    welcomeBonusPaidIds.add(userId);
    return true;
  }
  const ledger = walletLedger.get(userId) || [];
  if (ledger.some((e) => e.kind === 'credit' && /welcome\s*bonus/i.test(e.reason))) {
    welcomeBonusPaidIds.add(userId);
    return true;
  }
  return false;
}

function readInstallId(req: express.Request): string {
  return String(
    req.headers['x-install-id'] || req.body?.installId || '',
  ).trim().slice(0, 80);
}

function hostMonthStats(hostId: string, monthStartMs: number) {
  const start =
    Number.isFinite(monthStartMs) && monthStartMs > 0
      ? monthStartMs
      : (() => {
          const d = new Date();
          d.setUTCDate(1);
          d.setUTCHours(0, 0, 0, 0);
          return d.getTime();
        })();
  const monthCalls = callHistory.filter(
    (c) =>
      c.hostId === hostId &&
      (c.endedAt || c.startedAt || 0) >= start &&
      (c.status === 'ended' || c.status === 'accepted' || (c.billedMinutes || 0) > 0),
  );
  const earnings = hostEarningTxns(hostId, start);
  const callTxns = earnings.filter((txn) => txn.type === 'call_minute');
  const giftTxns = earnings.filter((txn) => txn.type === 'gift');
  const liveEntryTxns = earnings.filter((txn) => txn.type === 'live_entry');
  const monthLive = liveSessionHistory.filter(
    (s) => s.hostId === hostId && (s.startedAt || 0) >= start,
  );
  const callCoins = callTxns.reduce((sum, txn) => sum + txn.coinsCreditedHost, 0);
  const giftCoins = giftTxns.reduce((sum, txn) => sum + txn.coinsCreditedHost, 0);
  const liveCoins = liveEntryTxns.reduce(
    (sum, txn) => sum + txn.coinsCreditedHost,
    0,
  );
  const callIds = new Set(monthCalls.map((call) => call.id));
  for (const txn of callTxns) if (txn.callId) callIds.add(txn.callId);
  return {
    callCoins,
    giftCoins,
    liveCoins,
    totalCoins: callCoins + giftCoins + liveCoins,
    callsCount: callIds.size,
    callMinutes: callTxns.length,
    giftCount: giftTxns.length,
    liveSeconds: monthLive.reduce((s, row) => s + Math.max(0, row.durationSec || 0), 0),
    liveSessions: monthLive.length,
    monthStartMs: start,
  };
}

function followerCount(hostId: string): number {
  return hostFollowers.get(hostId)?.size || 0;
}

(function hydrateWalletsFromDisk() {
  const snap = loadWalletSnapshot();
  if (!snap) return;
  for (const w of snap.wallets || []) {
    const row = { ...w } as WalletRow;
    wallets.set(w.userId, row);
    if (row.welcomeBonusGranted) welcomeBonusPaidIds.add(w.userId);
  }
  for (const [uid, list] of Object.entries(snap.ledger || {})) {
    walletLedger.set(uid, list as LedgerEntry[]);
    if (
      (list as LedgerEntry[]).some(
        (e) => e.kind === 'credit' && /welcome\s*bonus/i.test(String(e.reason || '')),
      )
    ) {
      welcomeBonusPaidIds.add(uid);
    }
  }
  for (const tok of snap.iapReceipts || []) iapReceipts.add(tok);
  console.log(`[persist] restored ${wallets.size} wallets from disk`);
})();

function flushWalletsToDisk() {
  // Legacy wallets.json kept as secondary backup; primary is coincall-snapshot.json
  saveWalletSnapshot({
    wallets: [...wallets.values()],
    ledger: Object.fromEntries([...walletLedger.entries()]),
    iapReceipts: [...iapReceipts],
  });
  persist();
}
setInterval(flushWalletsToDisk, 15_000);


/** Active app users (WS / heartbeat) — mass text targets */
type ActiveUserRow = {
  userId: string;
  userName: string;
  avatarUrl?: string;
  role: 'user' | 'host';
  lastSeen: number;
};
const activeUsers = new Map<string, ActiveUserRow>();

/** Per-user recharge totals — updated on every recharge */
type RechargeUserRow = {
  userId: string;
  userName: string;
  totalCoins: number;
  lastCoins: number;
  rechargeCount: number;
  lastAt: number;
};
type RechargeEvent = {
  id: string;
  userId: string;
  userName: string;
  coins: number;
  totalCoins: number;
  roomId?: string;
  at: number;
};
const rechargeByUser = new Map<string, RechargeUserRow>();
const recentRecharges: RechargeEvent[] = [];

type SupportMessage = {
  id: string;
  from: 'host' | 'admin';
  text: string;
  imageUrl?: string;
  createdAt: number;
};

type SupportTicket = {
  id: string;
  hostId: string;
  hostName: string;
  text: string;
  imageUrl?: string;
  status: 'open' | 'answered' | 'closed';
  messages: SupportMessage[];
  createdAt: number;
  updatedAt: number;
};
const supportTickets: SupportTicket[] = [];
const massTextHistory: Array<{
  id: string;
  hostId: string;
  hostName: string;
  text: string;
  toCount: number;
  userIds: string[];
  at: number;
}> = [];

function touchActiveUser(input: {
  userId: string;
  userName?: string;
  avatarUrl?: string;
  role?: 'user' | 'host';
}) {
  const userId = String(input.userId || '').trim();
  if (!userId || userId === 'anon' || userId === 'system') return;
  const prev = activeUsers.get(userId);
  const wallet = wallets.get(userId);
  const nextName = String(
    input.userName ||
      prev?.userName ||
      wallet?.displayName ||
      'User',
  ).slice(0, 40);
  const nextAvatar =
    String(input.avatarUrl || prev?.avatarUrl || wallet?.avatarUrl || '').trim() ||
    undefined;
  activeUsers.set(userId, {
    userId,
    userName: nextName,
    avatarUrl: nextAvatar,
    role: input.role || prev?.role || 'user',
    lastSeen: Date.now(),
  });
}

function pruneActiveUsers(maxAgeMs = 15 * 60_000) {
  const now = Date.now();
  for (const [id, row] of activeUsers) {
    if (now - row.lastSeen > maxAgeMs) activeUsers.delete(id);
  }
}

function listActiveUsers(maxAgeMs = 15 * 60_000) {
  pruneActiveUsers(maxAgeMs);
  return [...activeUsers.values()]
    .filter((u) => u.role === 'user')
    .map((u) => {
      const wallet = wallets.get(u.userId);
      return {
        ...u,
        userName:
          u.userName && u.userName !== 'User'
            ? u.userName
            : wallet?.displayName || u.userName,
        avatarUrl: u.avatarUrl || wallet?.avatarUrl,
      };
    })
    .sort((a, b) => b.lastSeen - a.lastSeen);
}

/** Create/update recharge row for userId every time they recharge */
function recordUserRecharge(input: {
  userId: string;
  coins: number;
  userName?: string;
  roomId?: string;
}): RechargeEvent {
  const userId = String(input.userId || '').trim() || 'viewer';
  const coins = Math.max(1, Math.floor(Number(input.coins) || 0));
  const userName = String(input.userName || rechargeByUser.get(userId)?.userName || 'Viewer').slice(
    0,
    40,
  );
  const prev = rechargeByUser.get(userId);
  const row: RechargeUserRow = {
    userId,
    userName,
    totalCoins: (prev?.totalCoins || 0) + coins,
    lastCoins: coins,
    rechargeCount: (prev?.rechargeCount || 0) + 1,
    lastAt: Date.now(),
  };
  rechargeByUser.set(userId, row);
  touchActiveUser({ userId, userName, role: 'user' });

  const event: RechargeEvent = {
    id: randomUUID().slice(0, 10),
    userId,
    userName,
    coins,
    totalCoins: row.totalCoins,
    roomId: input.roomId,
    at: row.lastAt,
  };
  recentRecharges.unshift(event);
  if (recentRecharges.length > 200) recentRecharges.length = 200;

  broadcastWs({
    type: 'recharge:updated',
    payload: {
      event,
      user: row,
      users: [...rechargeByUser.values()].sort((a, b) => b.lastAt - a.lastAt),
    },
  });
  // Notify live hosts via SSE when a user recharges
  for (const h of listPresence()) {
    if (h.isLive || h.isOnline) {
      pushToHost(h.id, 'system_recharge', {
        type: 'recharge',
        title: 'System information',
        body: `ID ${userId} user, recharge ${coins} coins`,
        userId,
        coins,
        totalCoins: row.totalCoins,
      });
    }
  }
  if (input.roomId) {
    broadcastWs({
      type: 'live:recharge',
      payload: {
        roomId: input.roomId,
        userId,
        userName,
        coins,
        totalCoins: row.totalCoins,
        at: row.lastAt,
      },
    });
  }
  return event;
}

function pushLedger(
  userId: string,
  amount: number,
  reason: string,
  kind: 'credit' | 'spend',
) {
  const entry: LedgerEntry = {
    id: randomUUID(),
    userId,
    amount,
    reason,
    kind,
    at: Date.now(),
  };
  const list = walletLedger.get(userId) || [];
  list.unshift(entry);
  walletLedger.set(userId, list.slice(0, 100));
  persist();
  return entry;
}

/** Shared deps for authoritative coinLedger mutations */
function coinDeps() {
  return {
    getWallet: (userId: string) => {
      const row = ensureWallet(userId);
      return {
        userId: row.userId,
        coinBalance: row.coinBalance,
        xp: row.xp,
      };
    },
    setWallet: (w: { userId: string; coinBalance: number; xp: number }) => {
      const row = ensureWallet(w.userId);
      row.coinBalance = w.coinBalance;
      row.xp = w.xp;
      wallets.set(w.userId, row);
    },
    ensureWallet: (userId: string) => {
      const row = ensureWallet(userId);
      return {
        userId: row.userId,
        coinBalance: row.coinBalance,
        xp: row.xp,
      };
    },
    persist,
    onTxn: (txn: CoinTxn) => {
      if (txn.status !== 'completed') return;
      if (txn.coinsDeducted > 0 && txn.userId !== PLATFORM_TREASURY_ID) {
        pushLedger(txn.userId, txn.coinsDeducted, txn.reason, 'spend');
      }
      if (txn.coinsMinted > 0) {
        pushLedger(txn.userId, txn.coinsMinted, txn.reason, 'credit');
      }
      if (txn.coinsCreditedHost > 0 && txn.hostId) {
        pushLedger(
          txn.hostId,
          txn.coinsCreditedHost,
          `${txn.reason}_host`,
          'credit',
        );
      }
      if (txn.coinsCreditedPlatform > 0) {
        pushLedger(
          PLATFORM_TREASURY_ID,
          txn.coinsCreditedPlatform,
          `${txn.reason}_platform`,
          'credit',
        );
      }
    },
  };
}

function broadcastWallet(userId: string) {
  const row = ensureWallet(userId);
  broadcastWs({
    type: 'wallet:updated',
    payload: {
      userId,
      coinBalance: row.coinBalance,
      xp: row.xp,
    },
  });
}

const IAP_PRODUCTS = [
  {
    productId: 'zuko_coins_90',
    coins: 90,
    bonusCoins: 0,
    priceLabel: 'Store price',
    title: '90',
  },
  {
    productId: 'zuko_coins_600',
    coins: 600,
    bonusCoins: 0,
    priceLabel: 'Store price',
    title: '600',
    popular: true,
  },
  {
    productId: 'zuko_coins_1300',
    coins: 1300,
    bonusCoins: 0,
    priceLabel: 'Store price',
    title: '1,300',
    best: true,
  },
];
let VIP_PLANS = [
  { id: 'luma_vip_week', name: 'VIP Week', priceLabel: 'Store price', period: '/ week', coins: 100 },
  { id: 'luma_vip_month', name: 'VIP Month', priceLabel: 'Store price', period: '/ month', coins: 500 },
  { id: 'luma_vip_year', name: 'VIP Year', priceLabel: 'Store price', period: '/ year', coins: 7500 },
];

function publicPricingConfig() {
  return {
    updatedAt: pricingUpdatedAt,
    coinPackages: IAP_PRODUCTS,
    vipPlans: VIP_PLANS,
    callBilling: {
      rateUnitCoins: rateUnitCoins(),
      formula: 'chargePerMinute = hostRate × rateUnitCoins',
      intervalMs: RECURRING_CALL_CHARGE_MS,
      firstCharge: 'after_both_rtc_connected',
      livePrivateCallPolicy: 'pause_live',
    },
  };
}

let pricingUpdatedAt = Date.now();

app.get('/api/config/pricing', (_req, res) => {
  res.json(publicPricingConfig());
});

app.post('/api/admin/config/pricing', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const packages = Array.isArray(req.body?.coinPackages)
    ? req.body.coinPackages
    : null;
  const plans = Array.isArray(req.body?.vipPlans) ? req.body.vipPlans : null;
  const requestedRateUnit = req.body?.callBilling?.rateUnitCoins;
  if (!packages?.length || !plans?.length) {
    res.status(400).json({ error: 'coinPackages and vipPlans are required' });
    return;
  }
  const nextPackages = packages.slice(0, 12).map((p: Record<string, unknown>) => ({
    productId: String(p.productId || '').trim(),
    title: String(p.title || '').trim().slice(0, 60),
    coins: Math.max(1, Math.floor(Number(p.coins) || 0)),
    bonusCoins: Math.max(0, Math.floor(Number(p.bonusCoins) || 0)),
    priceLabel: String(p.priceLabel || '').trim().slice(0, 24),
    popular: Boolean(p.popular),
  }));
  const nextPlans = plans.slice(0, 8).map((p: Record<string, unknown>) => ({
    id: String(p.id || '').trim(),
    name: String(p.name || '').trim().slice(0, 60),
    priceLabel: String(p.priceLabel || '').trim().slice(0, 24),
    period: String(p.period || '').trim().slice(0, 24),
    coins: Math.max(0, Math.floor(Number(p.coins) || 0)),
  }));
  if (
    nextPackages.some((p: { productId: string; title: string; priceLabel: string }) =>
      !p.productId || !p.title || !p.priceLabel,
    ) ||
    nextPlans.some((p: { id: string; name: string; priceLabel: string }) =>
      !p.id || !p.name || !p.priceLabel,
    )
  ) {
    res.status(400).json({ error: 'Every pricing row needs id, name and price' });
    return;
  }
  IAP_PRODUCTS.splice(0, IAP_PRODUCTS.length, ...nextPackages);
  VIP_PLANS = nextPlans;
  if (requestedRateUnit !== undefined) configureRateUnitCoins(requestedRateUnit);
  pricingUpdatedAt = Date.now();
  persist();
  res.json({ ok: true, ...publicPricingConfig() });
});

function allocateAppId(): string {
  for (let i = 0; i < 40; i++) {
    const id = String(Math.floor(100000 + Math.random() * 900000));
    let taken = false;
    for (const w of wallets.values()) {
      if (w.appId === id) {
        taken = true;
        break;
      }
    }
    if (!taken) return id;
  }
  return String(Date.now()).slice(-6);
}

function ensureWallet(userId: string, patch?: Partial<WalletRow>): WalletRow {
  let row = wallets.get(userId);
  if (!row) {
    row = {
      userId,
      coinBalance: 0,
      xp: 0,
      isPremium: false,
      displayName: patch?.displayName || 'Luma Fan',
      avatarUrl: patch?.avatarUrl,
      bio: patch?.bio || '',
      role: patch?.role || 'user',
      appId: patch?.appId || allocateAppId(),
    };
    wallets.set(userId, row);
    return row;
  }
  if (!row.appId) {
    row.appId = allocateAppId();
    wallets.set(userId, row);
  }
  if (patch) {
    if (patch.displayName) row.displayName = patch.displayName;
    if (patch.avatarUrl !== undefined) row.avatarUrl = patch.avatarUrl;
    if (patch.bio !== undefined) row.bio = patch.bio;
    if (patch.role) row.role = patch.role;
    if (patch.isPremium !== undefined) row.isPremium = patch.isPremium;
    if (patch.coinBalance !== undefined) row.coinBalance = patch.coinBalance;
    if (patch.xp !== undefined) row.xp = patch.xp;
    if (patch.appId) row.appId = patch.appId;
    wallets.set(userId, row);
  }
  return row;
}

/** Prefer durable on-disk user avatar over stale remote / dicebear URLs */
function resolveWalletAvatar(row: WalletRow): string | undefined {
  if (hasStoredUserAvatar(row.userId)) {
    return userAvatarPublicUrl(row.userId);
  }
  return row.avatarUrl;
}

function walletPublic(row: WalletRow) {
  return {
    userId: row.userId,
    coinBalance: row.coinBalance,
    xp: row.xp,
    isPremium: row.isPremium,
    displayName: row.displayName,
    avatarUrl: resolveWalletAvatar(row),
    bio: row.bio || '',
    appId: row.appId,
    accountStatus: row.accountStatus || 'active',
  };
}

/**
 * Same install → same wallet userId (survives localStorage wipe / reinstall
 * when Expo shell re-injects the durable install id).
 */
function resolveWalletUserId(
  requested: string,
  installId: string,
): { userId: string; restored: boolean } {
  const req = String(requested || '').trim();
  const inst = String(installId || '').trim();
  // An authenticated account owns one wallet across every device. A stale
  // install-to-guest mapping must never replace that account wallet.
  if (getUserAccountById(req)) {
    if (inst) installUserMap.set(inst, req);
    return { userId: req, restored: false };
  }
  if (inst) {
    const mapped = installUserMap.get(inst);
    if (mapped && wallets.has(mapped) && mapped !== req) {
      return { userId: mapped, restored: true };
    }
    if (!mapped && req) {
      installUserMap.set(inst, req);
    } else if (mapped && !wallets.has(mapped) && req) {
      installUserMap.set(inst, req);
    }
  }
  return { userId: req, restored: false };
}

/** Block spend / calls when admin suspended or banned the user */
function assertUserAccountActive(
  userId: string,
  res: express.Response,
): boolean {
  const row = ensureWallet(userId);
  const status = row.accountStatus || 'active';
  if (status === 'banned' || status === 'suspended') {
    res.status(403).json({
      error: status === 'banned' ? 'Account banned' : 'Account suspended',
      accountStatus: status,
      wallet: walletPublic(row),
    });
    return false;
  }
  return true;
}

app.post('/api/wallet/me', (req, res) => {
  const requestedId = String(
    req.body?.userId || req.headers['x-user-id'] || '',
  ).trim();
  if (!requestedId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  if (!requireUserMatch(req, res, requestedId)) return;
  const installId = readInstallId(req);
  const { userId, restored } = resolveWalletUserId(requestedId, installId);
  if (installId && !installUserMap.has(installId)) {
    installUserMap.set(installId, userId);
  }
  const existed = wallets.has(userId);
  const displayName = String(req.body?.displayName || '').trim();
  const avatarUrl = String(req.body?.avatarUrl || '').trim();
  const bio = req.body?.bio != null ? String(req.body.bio).trim().slice(0, 280) : undefined;
  const updateProfile = Boolean(req.body?.updateProfile);
  /** Client already claimed welcome on this device — never re-grant after API wipe */
  const clientWelcomeClaimed = Boolean(req.body?.welcomeAlreadyClaimed);

  let row: WalletRow;
  let welcomeBonusGrantedNow = false;
  if (!existed) {
    row = ensureWallet(userId, {
      displayName: displayName || 'Luma Fan',
      avatarUrl: avatarUrl || undefined,
      bio: bio || '',
      role: req.body?.role === 'host' ? 'host' : 'user',
    });
    const grant = resolveWelcomeGrant({
      userId,
      installId: installId || undefined,
      alreadyPaidUser: hasWelcomeBonusAlready(userId, installId || undefined),
      clientClaimed: clientWelcomeClaimed,
    });
    if (!grant.granted) {
      // Recreated after restart / reinstall abuse — do NOT add another welcome
      row.coinBalance = 0;
      row.xp = row.xp || 0;
      markWelcomeBonusPaid(userId, installId || undefined);
      wallets.set(userId, row);
      persist();
    } else {
      // Signup: ONLY welcome (≤100). Never daily/spin/referral here.
      const welcomeAmt = Math.min(100, Math.max(0, grant.coins));
      const minted = mintCoins(coinDeps(), {
        txnKey: `welcome:${userId}`,
        type: 'reward_welcome',
        userId,
        amount: welcomeAmt,
        reason: 'Welcome bonus',
      });
      if (minted.ok) {
        markWelcomeBonusPaid(userId, installId || undefined);
        row = ensureWallet(userId);
        // Hard invariant: new wallet balance === welcome only
        if (row.coinBalance !== welcomeAmt) {
          row.coinBalance = welcomeAmt;
          wallets.set(userId, row);
          persist();
        }
        row.xp = Math.max(row.xp || 0, 10);
        wallets.set(userId, row);
        welcomeBonusGrantedNow = welcomeAmt > 0;
        broadcastWallet(userId);
      }
    }
  } else {
    row = ensureWallet(userId);
    if (row.welcomeBonusGranted || clientWelcomeClaimed) {
      markWelcomeBonusPaid(userId, installId || undefined);
    }
    if (updateProfile || displayName || bio !== undefined) {
      if (displayName) row.displayName = displayName;
      if (avatarUrl && !hasStoredUserAvatar(userId)) row.avatarUrl = avatarUrl;
      else if (avatarUrl && /^https?:\/\//i.test(avatarUrl)) row.avatarUrl = avatarUrl;
      if (bio !== undefined) row.bio = bio;
      wallets.set(userId, row);
      persist();
    }
  }

  res.json({
    wallet: walletPublic(row),
    created: !existed,
    restored,
    restoredUserId: restored ? userId : undefined,
    welcomeBonus: welcomeBonusGrantedNow,
    welcomeAmount: welcomeBonusCoins(),
  });
});

/**
 * Host/user profile sync — does NOT accept client coinBalance (anti-fraud).
 * Returns authoritative server wallet; may update displayName/role only.
 */
app.post('/api/wallet/sync', (req, res) => {
  const userId = String(req.body?.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  const row = ensureWallet(userId, {
    displayName: String(req.body?.displayName || 'Host'),
    role: req.body?.role === 'host' ? 'host' : 'user',
  });
  if (req.body?.displayName) {
    row.displayName = String(req.body.displayName).slice(0, 40);
  }
  if (req.body?.role === 'host' || req.body?.role === 'user') {
    row.role = req.body.role;
  }
  wallets.set(userId, row);
  if (row.role === 'host') {
    ensureHostRecord(userId, {
      name: row.displayName,
      coinBalance: row.coinBalance,
    });
  }
  persist();
  res.json({
    ok: true,
    wallet: walletPublic(row),
    note: 'coinBalance is server-authoritative; client balance ignored',
  });
});

app.post('/api/wallet/credit', (req, res) => {
  const userId = String(req.body?.userId || '').trim();
  const amount = Number(req.body?.amount || 0);
  const reason = String(req.body?.reason || 'credit');
  if (!userId || !Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'userId and positive amount required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  const adminOk =
    isAdminCredential(req.headers['x-admin-key'] || req.query.key);
  const floored = Math.floor(amount);
  if (!adminOk) {
    res.status(403).json({
      error: 'Coin credits require admin authorization',
      hint: 'Calls, gifts, live entry, purchases and rewards use dedicated ledger routes',
    });
    return;
  }

  const txnKey =
    String(req.headers['idempotency-key'] || req.body?.txnKey || '').trim() ||
    `admin_credit:${userId}:${floored}:${randomUUID()}`;
  const mintType = /iap|purchase|recharge|topup/i.test(reason)
    ? ('purchase' as const)
    : ('admin_credit' as const);

  const result = mintCoins(coinDeps(), {
    txnKey,
    type: mintType,
    userId,
    amount: floored,
    reason,
  });
  if (!result.ok) {
    res.status(result.code).json({ error: result.txn.error || 'Credit failed', txn: result.txn });
    return;
  }

  const row = ensureWallet(userId, {
    displayName: String(req.body?.displayName || 'Host'),
    role: req.body?.role === 'host' ? 'host' : 'user',
  });
  const reasonLower = reason.toLowerCase();
  if (
    /host_earn/.test(reasonLower) &&
    !/call_end|call_earn_|gift_from_|call_minute/.test(reasonLower)
  ) {
    recordHostEarning(userId, floored, {
      kind: 'other',
      coinBalance: row.coinBalance,
      broadcast: broadcastWs,
    });
  }
  const isRecharge =
    reasonLower.includes('iap') ||
    reasonLower.includes('recharge') ||
    reasonLower.includes('topup') ||
    reasonLower.includes('purchase');
  if (isRecharge) {
    recordUserRecharge({
      userId,
      coins: floored,
      userName: String(req.body?.displayName || req.body?.userName || row.displayName),
      roomId: String(req.body?.roomId || '').trim() || undefined,
    });
  }
  broadcastWallet(userId);
  res.json({
    ok: true,
    reason,
    txn: result.txn,
    wallet: walletPublic(row),
    balanceCheck: {
      previous: result.txn.userBalanceBefore,
      added: result.txn.coinsMinted,
      deducted: result.txn.coinsDeducted,
      current: result.txn.userBalanceAfter,
    },
  });
});

/** Authoritative daily login + spin rewards (amounts fixed server-side) */
app.get('/api/rewards/status', (req, res) => {
  const userId = String(req.query.userId || req.headers['x-user-id'] || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  const installId = readInstallId(req);
  res.json({ status: getRewardStatus(userId, installId || undefined) });
});

app.post('/api/rewards/daily', (req, res) => {
  const userId = String(req.body?.userId || req.headers['x-user-id'] || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  const installId = readInstallId(req);
  const locked = withClaimLock(userId, () => {
    const result = claimDailyLogin(userId, installId || undefined);
    if (!result.ok) return { kind: 'fail' as const, result };
    const minted = mintCoins(coinDeps(), {
      txnKey: result.txnKey,
      type: 'reward_daily',
      userId,
      amount: result.coins,
      reason: result.reason,
    });
    if (!minted.ok) return { kind: 'mint_fail' as const, minted, result };
    const row = ensureWallet(userId, { role: 'user' });
    row.xp += 20;
    wallets.set(userId, row);
    persist();
    broadcastWallet(userId);
    return { kind: 'ok' as const, result, minted, row };
  });
  if (!locked.ok) {
    res.status(429).json({ error: locked.error });
    return;
  }
  const out = locked.value;
  if (out.kind === 'fail') {
    res.status(409).json({ error: out.result.error, status: out.result.status });
    return;
  }
  if (out.kind === 'mint_fail') {
    res.status(out.minted.code).json({
      error: out.minted.txn.error,
      txn: out.minted.txn,
    });
    return;
  }
  res.json({
    ok: true,
    coins: out.result.coins,
    reason: out.result.reason,
    status: out.result.status,
    txn: out.minted.txn,
    wallet: walletPublic(out.row),
    balanceCheck: {
      previous: out.minted.txn.userBalanceBefore,
      added: out.minted.txn.coinsMinted,
      deducted: out.minted.txn.coinsDeducted,
      current: out.minted.txn.userBalanceAfter,
    },
  });
});

app.post('/api/rewards/spin', (req, res) => {
  const userId = String(req.body?.userId || req.headers['x-user-id'] || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  const installId = readInstallId(req);
  const locked = withClaimLock(userId, () => {
    const result = claimSpin(userId, installId || undefined);
    if (!result.ok) return { kind: 'fail' as const, result };
    const minted = mintCoins(coinDeps(), {
      txnKey: result.txnKey,
      type: 'reward_spin',
      userId,
      amount: result.coins,
      reason: result.reason,
    });
    if (!minted.ok) return { kind: 'mint_fail' as const, minted, result };
    const row = ensureWallet(userId, { role: 'user' });
    row.xp += 15;
    wallets.set(userId, row);
    persist();
    broadcastWallet(userId);
    return { kind: 'ok' as const, result, minted, row };
  });
  if (!locked.ok) {
    res.status(429).json({ error: locked.error });
    return;
  }
  const out = locked.value;
  if (out.kind === 'fail') {
    res.status(409).json({ error: out.result.error, status: out.result.status });
    return;
  }
  if (out.kind === 'mint_fail') {
    res.status(out.minted.code).json({
      error: out.minted.txn.error,
      txn: out.minted.txn,
    });
    return;
  }
  res.json({
    ok: true,
    coins: out.result.coins,
    reason: out.result.reason,
    status: out.result.status,
    txn: out.minted.txn,
    wallet: walletPublic(out.row),
    prize: {
      id: `c${out.result.coins}`,
      label: String(out.result.coins),
      coins: out.result.coins,
      weight: 1,
      color: '#ffb800',
    },
    balanceCheck: {
      previous: out.minted.txn.userBalanceBefore,
      added: out.minted.txn.coinsMinted,
      deducted: out.minted.txn.coinsDeducted,
      current: out.minted.txn.userBalanceAfter,
    },
  });
});

app.post('/api/rewards/referral', (req, res) => {
  const userId = String(req.body?.userId || req.headers['x-user-id'] || '').trim();
  const code = String(req.body?.code || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  const installId = readInstallId(req);
  const locked = withClaimLock(userId, () => {
    const result = claimReferralReward(userId, code, installId || undefined);
    if (!result.ok) return { kind: 'fail' as const, result };
    const minted = mintCoins(coinDeps(), {
      txnKey: result.txnKey,
      type: 'reward_referral',
      userId,
      amount: result.coins,
      reason: result.reason,
      meta: { code: String(code).trim().toUpperCase().slice(0, 32) },
    });
    if (!minted.ok) return { kind: 'mint_fail' as const, minted, result };
    const row = ensureWallet(userId, { role: 'user' });
    wallets.set(userId, row);
    persist();
    broadcastWallet(userId);
    return { kind: 'ok' as const, result, minted, row };
  });
  if (!locked.ok) {
    res.status(429).json({ error: locked.error });
    return;
  }
  const out = locked.value;
  if (out.kind === 'fail') {
    res.status(409).json({ error: out.result.error, status: out.result.status });
    return;
  }
  if (out.kind === 'mint_fail') {
    res.status(out.minted.code).json({
      error: out.minted.txn.error,
      txn: out.minted.txn,
    });
    return;
  }
  res.json({
    ok: true,
    coins: out.result.coins,
    reason: out.result.reason,
    status: out.result.status,
    txn: out.minted.txn,
    wallet: walletPublic(out.row),
    balanceCheck: {
      previous: out.minted.txn.userBalanceBefore,
      added: out.minted.txn.coinsMinted,
      deducted: out.minted.txn.coinsDeducted,
      current: out.minted.txn.userBalanceAfter,
    },
  });
});

app.get('/api/wallet/history/:userId', (req, res) => {
  const userId = String(req.params.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  ensureWallet(userId);
  res.json({ history: walletLedger.get(userId) || [] });
});

/** Full double-entry coin transactions (authoritative audit trail) */
app.get('/api/wallet/transactions', (req, res) => {
  const userId = String(req.query.userId || req.headers['x-user-id'] || '').trim();
  const hostId = String(req.query.hostId || '').trim();
  const callId = String(req.query.callId || '').trim();
  const limit = Number(req.query.limit || 100);
  res.json({
    transactions: listCoinTxns({
      userId: userId || undefined,
      hostId: hostId || undefined,
      callId: callId || undefined,
      limit,
    }),
    commissionRate: platformCommissionRate(),
    platformTreasuryId: PLATFORM_TREASURY_ID,
  });
});

app.get('/api/wallet/balance-check/:userId', (req, res) => {
  const userId = String(req.params.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  const row = ensureWallet(userId);
  const check = reconcileWalletBalance(coinDeps(), userId);
  const ledger = walletLedger.get(userId) || [];
  const ledgerSum = ledger.reduce(
    (sum, e) => sum + (e.kind === 'credit' ? e.amount : -e.amount),
    0,
  );
  res.json({
    ok: check.ok && (check.derivedBalance == null || check.derivedBalance === row.coinBalance),
    userId,
    walletBalance: row.coinBalance,
    derivedFromCoinTxns: check.derivedBalance,
    ledgerEntrySum: ledgerSum,
    ledgerMatchesWallet: ledgerSum === row.coinBalance,
    recentTransactions: listCoinTxns({ userId, limit: 25 }),
  });
});

app.get('/api/admin/coin-audit', (req, res) => {
  if (!requireStaff(req, res)) return;
  const sample = dumpCoinTxns().slice(0, 500);
  const conservation = auditConservation(sample);
  const treasury = ensureWallet(PLATFORM_TREASURY_ID);
  res.json({
    ok: conservation.ok,
    brokenCount: conservation.broken.length,
    broken: conservation.broken.slice(0, 20),
    commissionRate: platformCommissionRate(),
    platformTreasury: walletPublic(treasury),
    recent: sample.slice(0, 50),
    totalTxns: sample.length,
  });
});

app.get('/api/wallet/products', (_req, res) => {
  res.json({ products: IAP_PRODUCTS });
});

app.post('/api/wallet/premium', (req, res) => {
  const userId = String(req.body?.userId || req.headers['x-user-id'] || '').trim();
  const isPremium = Boolean(req.body?.isPremium);
  const planId = String(req.body?.planId || '');
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  const adminOk =
    isAdminCredential(req.headers['x-admin-key'] || req.query.key);
  const allowFreeVip =
    process.env.ALLOW_FREE_VIP === '1' || process.env.NODE_ENV !== 'production';
  if (isPremium && !adminOk && !allowFreeVip) {
    res.status(403).json({
      error: 'VIP requires verified IAP (or admin). Set ALLOW_FREE_VIP=1 only for demos.',
    });
    return;
  }
  const row = ensureWallet(userId);
  row.isPremium = isPremium;
  if (isPremium && planId) {
    pushLedger(userId, 0, `VIP plan · ${planId}`, 'credit');
  }
  wallets.set(userId, row);
  persist();
  broadcastWs({
    type: 'wallet:updated',
    payload: { userId, coinBalance: row.coinBalance, xp: row.xp, isPremium },
  });
  res.json({ ok: true, wallet: walletPublic(row) });
});

app.get('/api/wallet/:userId', (req, res) => {
  const userId = String(req.params.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  const row = ensureWallet(userId);
  res.json({ wallet: walletPublic(row) });
});

app.post('/api/wallet/spend', (req, res) => {
  const userId = String(req.body?.userId || '').trim();
  const amount = Number(req.body?.amount || 0);
  const reason = String(req.body?.reason || 'spend');
  if (!userId || !Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'userId and positive amount required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  if (!assertUserAccountActive(userId, res)) return;

  // Call/gift must use transfer endpoints so host + platform are credited
  if (
    /call_minute|gift_to_|gift_from_|call_earn|fb_mirror/i.test(reason)
  ) {
    res.status(400).json({
      error:
        'Use /api/calls/:id/minute or /api/gifts/send for call/gift charges (host must be credited)',
    });
    return;
  }

  const floored = Math.floor(amount);
  const txnKey =
    String(req.headers['idempotency-key'] || req.body?.txnKey || '').trim() ||
    `spend:${userId}:${reason}:${floored}:${Date.now()}`;

  const result = debitOnly(coinDeps(), {
    txnKey,
    type: 'spend_misc',
    userId,
    amount: floored,
    reason,
    meta: req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : undefined,
  });
  if (!result.ok) {
    res.status(result.code).json({
      error: result.txn.error || 'Insufficient coins',
      wallet: walletPublic(ensureWallet(userId)),
      txn: result.txn,
    });
    return;
  }
  broadcastWallet(userId);
  res.json({
    ok: true,
    reason,
    txn: result.txn,
    wallet: walletPublic(ensureWallet(userId)),
  });
});

/**
 * Create checkout / deep-link session for web or native handoff.
 * Replace checkoutUrl with your Play Billing / Stripe Payment Link.
 */
app.all(['/api/wallet/iap/session', '/api/wallet/iap/verify'], (_req, res) => {
  res.status(410).json({
    error: 'LEGACY_PAYMENT_ENDPOINT_DISABLED',
    message: 'Update the app to use the secure /api/payments provider endpoints.',
  });
});

/**
 * Host withdrawal → EasyPaisa / JazzCash / Bank
 * If merchant credentials are missing, payout enters admin_review (manual pay).
 */
app.post('/api/host/withdrawals', async (req, res) => {
  const hostId = String(req.body?.hostId || '').trim();
  const amountCoins = Number(req.body?.amountCoins || 0);
  const gateway = String(req.body?.gateway || 'easypaisa') as WithdrawalRequest['gateway'];
  const accountName = String(req.body?.accountName || '').trim();
  const accountNumber = String(req.body?.accountNumber || '').trim();

  if (!hostId || amountCoins < 100 || !accountName || !accountNumber) {
    res.status(400).json({
      error: 'hostId, amountCoins>=100, accountName, accountNumber required',
    });
    return;
  }
  if (!requireUserMatch(req, res, hostId)) return;

  // Agency withdrawal rules when host is attributed
  const linkedAgencyId = getAgencyIdForHost(hostId);
  if (linkedAgencyId) {
    const agency = getAgency(linkedAgencyId);
    if (agency) {
      if (amountCoins < agency.minWithdrawCoins) {
        res.status(400).json({
          error: `Minimum withdrawal is ${agency.minWithdrawCoins} coins`,
        });
        return;
      }
      if (amountCoins > agency.maxWithdrawCoins) {
        res.status(400).json({
          error: `Maximum withdrawal is ${agency.maxWithdrawCoins} coins`,
        });
        return;
      }
      const dayStart = Date.now() - 24 * 60 * 60 * 1000;
      const dayTotal = withdrawals
        .filter(
          (w) =>
            w.hostId === hostId &&
            w.createdAt >= dayStart &&
            w.status !== 'failed',
        )
        .reduce((s, w) => s + w.amountCoins, 0);
      if (dayTotal + amountCoins > agency.dailyWithdrawCap) {
        res.status(400).json({
          error: `Daily withdrawal cap is ${agency.dailyWithdrawCap} coins`,
        });
        return;
      }
    }
  }

  // Server balance is authoritative — never trust client knownBalance
  const row = ensureWallet(hostId, {
    role: 'host',
    displayName: String(req.body?.displayName || 'Host'),
  });

  const wdKey = `withdrawal:${hostId}:${amountCoins}:${Date.now()}:${randomUUID().slice(0, 8)}`;
  const debited = debitOnly(coinDeps(), {
    txnKey: wdKey,
    type: 'withdrawal',
    userId: hostId,
    amount: amountCoins,
    reason: `withdrawal_${gateway}`,
  });
  if (!debited.ok) {
    res.status(debited.code).json({
      error: debited.txn.error || 'Insufficient host balance',
      wallet: walletPublic(row),
      txn: debited.txn,
    });
    return;
  }

  ensureHostRecord(hostId, { coinBalance: debited.txn.userBalanceAfter });

  const earningSummary = hostEarningsSummary(hostId);

  const request: WithdrawalRequest = {
    id: `wd_${randomUUID()}`,
    kind: 'host',
    hostId,
    hostName:
      row.displayName ||
      getHost(hostId)?.name ||
      getPresence(hostId)?.name ||
      'Host',
    hostAvatar:
      getHost(hostId)?.photoUrl ||
      getPresence(hostId)?.avatarUrl ||
      row.avatarUrl,
    amountCoins,
    gateway,
    accountName,
    accountNumber,
    status: linkedAgencyId ? 'agency_pending' : 'pending',
    agencyId: linkedAgencyId || undefined,
    agencyName: linkedAgencyId
      ? getAgency(linkedAgencyId)?.name
      : undefined,
    createdAt: Date.now(),
    walletBalanceBefore: debited.txn.userBalanceBefore,
    walletBalanceAfter: debited.txn.userBalanceAfter,
    totalCallsAtRequest: callHistory.filter((call) => call.hostId === hostId).length,
    answeredCallsAtRequest: callHistory.filter(
      (call) =>
        call.hostId === hostId &&
        (call.status === 'ended' ||
          call.status === 'accepted' ||
          call.billedMinutes > 0),
    ).length,
    missedCallsAtRequest: callHistory.filter(
      (call) =>
        call.hostId === hostId &&
        (call.endReason === 'missed' || call.endReason === 'rejected'),
    ).length,
    totalCallSecondsAtRequest: callHistory
      .filter((call) => call.hostId === hostId)
      .reduce((sum, call) => sum + Math.max(0, call.durationSec || 0), 0),
    callCoinsAtRequest: earningSummary.callCoins,
    giftCoinsAtRequest: earningSummary.giftCoins,
    lifetimeEarningsAtRequest: earningSummary.totalCoins,
  };
  withdrawals.unshift(request);

  try {
    if (linkedAgencyId) {
      request.status = 'agency_pending';
      request.providerRef = `agency_queue_${linkedAgencyId}`;
    } else if (gateway === 'easypaisa') {
      if (!process.env.EASYPAY_MERCHANT_ID || !process.env.EASYPAY_HASH_KEY) {
        request.status = 'admin_review';
        request.providerRef = `manual_ep_${Date.now()}`;
      } else {
        request.status = 'processing';
        request.providerRef = `ep_${Date.now()}`;
      }
    } else if (gateway === 'jazzcash') {
      if (!process.env.JAZZCASH_MERCHANT_ID || !process.env.JAZZCASH_INTEGRITY_SALT) {
        request.status = 'admin_review';
        request.providerRef = `manual_jc_${Date.now()}`;
      } else {
        request.status = 'processing';
        request.providerRef = `jc_${Date.now()}`;
      }
    } else if (!process.env.BANK_PAYOUT_WEBHOOK_SECRET) {
      request.status = 'admin_review';
      request.providerRef = `manual_bank_${Date.now()}`;
    } else {
      request.status = 'processing';
      request.providerRef = `bank_${Date.now()}`;
    }
  } catch (e: unknown) {
    request.status = 'failed';
    request.error = e instanceof Error ? e.message : 'Payout failed';
    const refunded = mintCoins(coinDeps(), {
      txnKey: `withdrawal_refund:${request.id}`,
      type: 'withdrawal_refund',
      userId: hostId,
      amount: amountCoins,
      reason: `withdrawal_refund_${request.id}`,
    });
    if (refunded.ok) {
      ensureHostRecord(hostId, { coinBalance: refunded.txn.userBalanceAfter });
    }
  }

  persist();
  broadcastWallet(hostId);
  broadcastWs({
    type: 'withdrawal:created',
    payload: request,
  });
  if (linkedAgencyId) {
    broadcastWs({
      type: 'agency:host-withdrawal',
      payload: request,
    });
  }

  res.json({
    ok: request.status !== 'failed',
    withdrawal: request,
    txn: debited.txn,
    wallet: walletPublic(ensureWallet(hostId)),
  });
});

app.get('/api/host/withdrawals/:hostId', (req, res) => {
  const hostId = String(req.params.hostId || '');
  res.json({
    withdrawals: withdrawals.filter((w) => w.hostId === hostId).slice(0, 50),
  });
});


app.get('/api/admin/wallets', (req, res) => {
  const key = String(req.query.key || req.headers['x-admin-key'] || '');
  if (!isAdminCredential(key)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const query = String(req.query.q || '').trim().toLowerCase();
  const queryDigits = query.replace(/\D/g, '');
  const allRows = [...wallets.values()]
    .map((w) => ({
      ...walletPublic(w),
      role: w.role,
      ledgerCount: (walletLedger.get(w.userId) || []).length,
    }));
  const all = allRows
    .filter((w) => {
      if (!query) return true;
      const appId = String(w.appId || '');
      if (queryDigits.length === 6 && appId === queryDigits) return true;
      return `${w.userId} ${w.displayName} ${w.role} ${appId}`
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => b.coinBalance - a.coinBalance);
  res.json({
    wallets: all,
    count: all.length,
    exactMatch:
      queryDigits.length === 6
        ? all.find((w) => String(w.appId || '') === queryDigits) || null
        : all.find((w) => String(w.userId).toLowerCase() === query) || null,
  });
});

app.get('/api/admin/hosts/:hostId/performance', (req, res) => {
  if (!requireStaff(req, res)) return;
  const requestedId = String(req.params.hostId || '').trim();
  const managed = getHost(requestedId);
  const aliases = new Set(
    [requestedId, managed?.id, managed?.hostId].map((v) => String(v || '').trim()).filter(Boolean),
  );
  const calls = callHistory.filter((row) => aliases.has(row.hostId));
  const gifts = giftHistory.filter((row) => aliases.has(row.toHostId));
  const lives = liveSessionHistory.filter((row) => aliases.has(row.hostId));
  const earningTxns = [...aliases].flatMap((hostId) => hostEarningTxns(hostId));
  const callEarnings = earningTxns
    .filter((txn) => txn.type === 'call_minute')
    .reduce((sum, txn) => sum + txn.coinsCreditedHost, 0);
  const giftEarnings = earningTxns
    .filter((txn) => txn.type === 'gift')
    .reduce((sum, txn) => sum + txn.coinsCreditedHost, 0);
  const liveEarnings = earningTxns
    .filter((txn) => txn.type === 'live_entry')
    .reduce((sum, txn) => sum + txn.coinsCreditedHost, 0);
  const totalCallSeconds = calls.reduce((sum, row) => sum + Math.max(0, row.durationSec || 0), 0);
  const lastActiveAt = Math.max(
    Number(managed?.updatedAt || 0),
    ...calls.map((row) => row.endedAt || row.startedAt || 0),
    ...gifts.map((row) => row.createdAt || 0),
    ...lives.map((row) => row.endedAt || row.startedAt || 0),
  );
  res.json({
    summary: {
      totalCalls: calls.length,
      totalCallSeconds,
      averageCallSeconds: calls.length ? Math.round(totalCallSeconds / calls.length) : 0,
      totalCallCoins: callEarnings,
      giftCoins: giftEarnings,
      liveEntryCoins: liveEarnings,
      totalEarnings: callEarnings + giftEarnings + liveEarnings,
      liveSeconds: lives.reduce((sum, row) => sum + Math.max(0, row.durationSec || 0), 0),
      lastActiveAt,
    },
    recentCalls: calls.slice(0, 20).map((row) => ({
      id: row.id,
      userName: row.userName,
      status: row.status,
      durationSec: row.durationSec,
      coinsSpent: row.coinsSpent,
      hostCoinsEarned: row.hostCoinsEarned,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
    })),
  });
});

app.post('/api/admin/wallets/:userId/status', (req, res) => {
  const key = String(req.body?.key || req.headers['x-admin-key'] || '');
  if (!isAdminCredential(key)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const userId = String(req.params.userId || '').trim();
  const status = String(req.body?.accountStatus || '').trim();
  if (!userId || !['active', 'suspended', 'banned'].includes(status)) {
    res.status(400).json({ error: 'userId and accountStatus required' });
    return;
  }
  const row = ensureWallet(userId);
  row.accountStatus = status as 'active' | 'suspended' | 'banned';
  wallets.set(userId, row);
  persist();
  res.json({ ok: true, wallet: walletPublic(row) });
});

/** Admin: live 1:1 + live rooms for Monitor / Remote Control */
app.get('/api/admin/active-sessions', (req, res) => {
  if (!requireStaff(req, res)) return;
  const staff = getAgencyAuth(req);
  if (
    staff?.kind === 'agency' &&
    (!staff.agency?.permissions.canViewCalls || !staff.agency?.id)
  ) {
    res.status(403).json({ error: 'Live call access is not enabled' });
    return;
  }
  const allowedHostIds =
    staff?.kind === 'agency' && staff.agency
      ? new Set(staff.agency.hostIds)
      : null;
  pruneHosts();
  const nowTs = Date.now();
  const activeCalls = [...calls.values()]
    .filter((c) => c.status === 'ringing' || c.status === 'accepted')
    .filter((c) => !allowedHostIds || allowedHostIds.has(c.hostId))
    .map((c) => {
      const startedAt = c.acceptedAt || c.createdAt;
      const coinsEarned = hostEarningTxns(c.hostId)
        .filter((txn) => txn.type === 'call_minute' && txn.callId === c.id)
        .reduce((sum, txn) => sum + txn.coinsCreditedHost, 0);
      return {
        id: c.id,
        kind: 'call' as const,
        channel: c.channel,
        hostId: c.hostId,
        hostName: c.hostName,
        peerId: c.userId,
        peerName: c.userName,
        peerAvatar: c.userAvatar,
        status: c.status,
        ratePerMinute: c.ratePerMinute,
        billedMinutes: c.billedMinutes || 0,
        startedAt,
        seconds: Math.max(0, Math.floor((nowTs - startedAt) / 1000)),
        coinsEarned,
      };
    });
  const rooms = [...liveRooms.values()]
    .filter((r) => r.isLive && String(r.mode || '') !== 'party')
    .filter((r) => !allowedHostIds || allowedHostIds.has(String(r.hostId || '')))
    .map((r) => ({
      id: String(r.id),
      kind: 'live' as const,
      channel: String(r.channel || `live_${r.hostId}`),
      hostId: String(r.hostId || ''),
      hostName: String(r.hostName || 'Host'),
      title: String(r.title || 'Live'),
      viewers: Number(r.viewers || 0),
      giftCoins: Number(r.giftCoins || 0),
      thumbnailUrl: r.thumbnailUrl ? String(r.thumbnailUrl) : undefined,
      status: 'live',
    }));
  res.json({
    calls: activeCalls,
    liveRooms: rooms,
    counts: {
      calls: activeCalls.length,
      liveRooms: rooms.length,
      total: activeCalls.length + rooms.length,
    },
  });
});

/** Admin force-end a bridge call (syncs both sides) */
app.post('/api/admin/calls/:id/end', (req, res) => {
  const key = String(req.body?.key || req.headers['x-admin-key'] || '');
  if (!isAdminCredential(key)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  const ended = forceEndCall(call, 'host');
  res.json({ ok: true, call: ended });
});

/** Super-admin scannable analytics snapshot */
app.get('/api/admin/stats', (req, res) => {
  const key = String(req.query.key || req.headers['x-admin-key'] || '');
  if (!isAdminCredential(key)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  pruneHosts();
  const presence = listPresence();
  const onlineHosts = presence.filter((h) => h.isOnline).length;
  const liveHosts = presence.filter((h) => h.isLive).length;
  const liveRoomCount = [...liveRooms.values()].filter((r) => r.isLive).length;
  const activeCalls = [...calls.values()].filter(
    (c) => c.status === 'ringing' || c.status === 'accepted',
  ).length;
  const userWallets = [...wallets.values()].filter(
    (w) => w.role === 'user' || w.userId.startsWith('luma_'),
  );
  const recentlyActive = [...activeUsers.values()].filter(
    (u) => Date.now() - u.lastSeen < 5 * 60_000,
  ).length;
  const paid = withdrawals.filter((w) => w.status === 'paid');
  const pendingWd = withdrawals.filter(
    (w) => w.status === 'pending' || w.status === 'admin_review' || w.status === 'processing',
  );
  const revenueCoins = paid.reduce((s, w) => s + w.amountCoins, 0);
  const giftLedger = [...walletLedger.values()]
    .flat()
    .filter((e) => e.kind === 'spend' && e.reason.includes('gift'));
  const dayMs = 86_400_000;
  const seriesDays: string[] = [];
  const seriesRevenue: number[] = [];
  const seriesUsers: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = Date.now() - i * dayMs;
    const label = new Date(dayStart).toLocaleDateString(undefined, {
      weekday: 'short',
    });
    seriesDays.push(label);
    const dayPaid = paid
      .filter((w) => w.createdAt >= dayStart - dayMs && w.createdAt < dayStart + dayMs)
      .reduce((s, w) => s + w.amountCoins, 0);
    const dayGifts = giftLedger
      .filter((e) => e.at >= dayStart - dayMs && e.at < dayStart + dayMs)
      .reduce((s, e) => s + e.amount, 0);
    const dayTotal = dayPaid + dayGifts;
    seriesRevenue.push(dayTotal);
    seriesUsers.push(
      [...activeUsers.values()].filter(
        (u) => u.lastSeen >= dayStart - dayMs && u.lastSeen < dayStart + dayMs,
      ).length,
    );
  }
  res.json({
    stats: {
      onlineHosts,
      liveHosts,
      liveRooms: liveRoomCount,
      activeCalls,
      activeUsers: recentlyActive || userWallets.length,
      totalUsers: userWallets.length,
      totalWallets: wallets.size,
      pendingWithdrawals: pendingWd.length,
      paidWithdrawals: paid.length,
      revenueCoins,
      totalCoinsInWallets: [...wallets.values()].reduce(
        (s, w) => s + w.coinBalance,
        0,
      ),
    },
    series: {
      days: seriesDays,
      revenue: seriesRevenue,
      users: seriesUsers,
    },
  });
});

app.post('/api/admin/wallets/:userId/credit', (req, res) => {
  const key = String(req.body?.key || req.headers['x-admin-key'] || '');
  if (!isAdminCredential(key)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const userId = String(req.params.userId || '').trim();
  const amount = Number(req.body?.amount || 0);
  const reason = String(req.body?.reason || 'Admin credit').trim();
  if (!userId || !Number.isFinite(amount) || amount === 0) {
    res.status(400).json({ error: 'userId and non-zero amount required' });
    return;
  }
  const delta = Math.floor(amount);
  const txnKey =
    String(req.body?.txnKey || req.headers['idempotency-key'] || '').trim() ||
    `admin:${userId}:${delta}:${randomUUID()}`;
  if (delta > 0) {
    const minted = mintCoins(coinDeps(), {
      txnKey,
      type: 'admin_credit',
      userId,
      amount: delta,
      reason,
    });
    if (!minted.ok) {
      res.status(minted.code).json({ error: minted.txn.error, txn: minted.txn });
      return;
    }
    const row = ensureWallet(userId);
    broadcastWallet(userId);
    res.json({
      ok: true,
      wallet: walletPublic(row),
      txn: minted.txn,
      balanceCheck: {
        previous: minted.txn.userBalanceBefore,
        added: minted.txn.coinsMinted,
        deducted: minted.txn.coinsDeducted,
        current: minted.txn.userBalanceAfter,
      },
    });
    return;
  }
  const debited = debitOnly(coinDeps(), {
    txnKey,
    type: 'admin_debit',
    userId,
    amount: Math.abs(delta),
    reason,
  });
  if (!debited.ok) {
    res.status(debited.code).json({ error: debited.txn.error, txn: debited.txn });
    return;
  }
  const row = ensureWallet(userId);
  broadcastWallet(userId);
  res.json({
    ok: true,
    wallet: walletPublic(row),
    txn: debited.txn,
    balanceCheck: {
      previous: debited.txn.userBalanceBefore,
      added: debited.txn.coinsMinted,
      deducted: debited.txn.coinsDeducted,
      current: debited.txn.userBalanceAfter,
    },
  });
});

/** Agency sends its collected, already-paid host coins to the platform admin. */
app.post('/api/agency/withdrawals', (req, res) => {
  if (!requireStaff(req, res)) return;
  const auth = getAgencyAuth(req);
  if (auth?.kind !== 'agency' || !auth.agency) {
    res.status(403).json({ error: 'Agency account required' });
    return;
  }
  const agency = auth.agency;
  if (!agency.permissions.canRequestPayout) {
    res.status(403).json({ error: 'Agency payout permission is disabled' });
    return;
  }
  const amountCoins = Math.floor(Number(req.body?.amountCoins) || 0);
  const gateway = String(req.body?.gateway || 'bank') as WithdrawalRequest['gateway'];
  const accountName = String(req.body?.accountName || agency.ownerName || '').trim();
  const accountNumber = String(req.body?.accountNumber || '').trim();
  if (
    amountCoins < agency.minWithdrawCoins ||
    !['easypaisa', 'jazzcash', 'bank'].includes(gateway) ||
    !accountName ||
    accountNumber.length < 6
  ) {
    res.status(400).json({
      error: `Valid payout details and at least ${agency.minWithdrawCoins} coins required`,
    });
    return;
  }
  const availableBefore = agencyAvailableCoins(agency.id);
  if (amountCoins > availableBefore) {
    res.status(409).json({
      error: 'Agency collected balance is too low',
      availableCoins: availableBefore,
    });
    return;
  }
  const collectedRows = withdrawals.filter(
    (row) =>
      withdrawalKind(row) === 'host' &&
      row.agencyId === agency.id &&
      row.status === 'agency_paid',
  );
  const request: WithdrawalRequest = {
    id: `awd_${randomUUID()}`,
    kind: 'agency',
    hostId: agency.id,
    hostName: agency.name,
    agencyId: agency.id,
    agencyName: agency.name,
    amountCoins,
    gateway,
    accountName,
    accountNumber,
    status: 'admin_review',
    createdAt: Date.now(),
    walletBalanceBefore: availableBefore,
    walletBalanceAfter: availableBefore - amountCoins,
    collectedHostWithdrawalIds: collectedRows.map((row) => row.id),
    providerRef: `agency_to_admin_${agency.id}`,
  };
  withdrawals.unshift(request);
  persist();
  broadcastWs({ type: 'agency:withdrawal-created', payload: request });
  res.status(201).json({
    ok: true,
    withdrawal: request,
    availableCoins: agencyAvailableCoins(agency.id),
  });
});

app.get('/api/agency/withdrawals', (req, res) => {
  if (!requireStaff(req, res)) return;
  const auth = getAgencyAuth(req);
  const agencyId =
    auth?.kind === 'agency'
      ? auth.agency?.id
      : String(req.query.agencyId || '').trim();
  if (!agencyId) {
    res.status(400).json({ error: 'agencyId required' });
    return;
  }
  if (auth?.kind === 'agency' && auth.agency?.id !== agencyId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json({
    availableCoins: agencyAvailableCoins(agencyId),
    collectedCoins: agencyCollectedCoins(agencyId),
    reservedCoins: agencyReservedCoins(agencyId),
    withdrawals: withdrawals
      .filter(
        (row) =>
          withdrawalKind(row) === 'agency' && row.agencyId === agencyId,
      )
      .slice(0, 100),
  });
});

app.get('/api/admin/withdrawals', (req, res) => {
  if (!requireStaff(req, res)) return;
  const auth = getAgencyAuth(req);
  let rows = withdrawals.slice(0, 200);
  if (auth?.kind === 'agency' && auth.agency) {
    rows = rows.filter(
      (row) =>
        withdrawalKind(row) === 'host' &&
        row.agencyId === auth.agency?.id,
    );
  } else {
    // Platform admin manages individual hosts and consolidated agency payouts.
    // Agency-linked host requests stay private to that agency's queue.
    rows = rows.filter(
      (row) =>
        withdrawalKind(row) === 'agency' ||
        (withdrawalKind(row) === 'host' && !row.agencyId),
    );
  }
  res.json({
    withdrawals: rows.slice(0, 100).map((withdrawal) => {
      if (withdrawalKind(withdrawal) === 'agency') {
        return {
          ...withdrawal,
          currentWalletBalance: agencyAvailableCoins(
            String(withdrawal.agencyId || withdrawal.hostId),
          ),
          isOnline: false,
          isLive: false,
        };
      }
      const wallet = ensureWallet(withdrawal.hostId, { role: 'host' });
      const calls = callHistory.filter((call) => call.hostId === withdrawal.hostId);
      const presence = getPresence(withdrawal.hostId);
      return {
        ...withdrawal,
        currentWalletBalance: wallet.coinBalance,
        isOnline: Boolean(presence?.isOnline),
        isLive: Boolean(presence?.isLive),
        currentTotalCalls: calls.length,
        currentAnsweredCalls: calls.filter(
          (call) =>
            call.status === 'ended' ||
            call.status === 'accepted' ||
            call.billedMinutes > 0,
        ).length,
        currentMissedCalls: calls.filter(
          (call) => call.endReason === 'missed' || call.endReason === 'rejected',
        ).length,
      };
    }),
  });
});

app.post('/api/admin/withdrawals/:id/status', (req, res) => {
  if (!requireStaff(req, res)) return;
  const auth = getAgencyAuth(req);
  const id = String(req.params.id || '');
  const requestedStatus = String(req.body?.status || '');
  if (!['pending', 'processing', 'paid', 'failed', 'admin_review'].includes(requestedStatus)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }
  const row = withdrawals.find((w) => w.id === id);
  if (!row) {
    res.status(404).json({ error: 'Withdrawal not found' });
    return;
  }
  if (
    (row.status === 'paid' || row.status === 'agency_paid') &&
    requestedStatus !== 'paid'
  ) {
    res.status(409).json({ error: 'A paid withdrawal is final' });
    return;
  }
  if (
    (row.status === 'failed' || row.status === 'agency_rejected') &&
    requestedStatus !== 'failed'
  ) {
    res.status(409).json({ error: 'A rejected withdrawal is final' });
    return;
  }
  let status = requestedStatus as WithdrawalRequest['status'];
  if (auth?.kind === 'agency' && auth.agency) {
    if (
      withdrawalKind(row) !== 'host' ||
      row.agencyId !== auth.agency.id
    ) {
      res.status(403).json({ error: 'This host request is outside your agency' });
      return;
    }
    if (!auth.agency.permissions.canRequestPayout) {
      res.status(403).json({ error: 'Payout management is disabled' });
      return;
    }
    if (!['agency_pending', 'agency_processing'].includes(row.status)) {
      res.status(409).json({ error: `Request is already ${row.status}` });
      return;
    }
    status =
      requestedStatus === 'paid'
        ? 'agency_paid'
        : requestedStatus === 'failed'
          ? 'agency_rejected'
          : 'agency_processing';
  } else if (row.agencyId && withdrawalKind(row) === 'host') {
    res.status(403).json({
      error: 'Agency-linked host withdrawals must be managed by their agency',
    });
    return;
  }
  const prev = row.status;
  row.status = status;
  const shouldRefundHost =
    withdrawalKind(row) === 'host' &&
    (status === 'failed' || status === 'agency_rejected') &&
    prev !== 'failed' &&
    prev !== 'agency_rejected' &&
    prev !== 'paid' &&
    prev !== 'agency_paid';
  if (shouldRefundHost) {
    const refunded = mintCoins(coinDeps(), {
      txnKey: `withdrawal_refund:${row.id}`,
      type: 'withdrawal_refund',
      userId: row.hostId,
      amount: row.amountCoins,
      reason: `withdrawal_refund_${row.id}`,
      meta: { withdrawalId: row.id },
    });
    if (!refunded.ok) {
      res.status(refunded.code).json({
        error: refunded.txn.error || 'Refund failed',
        txn: refunded.txn,
      });
      return;
    }
    ensureHostRecord(row.hostId, {
      coinBalance: refunded.txn.userBalanceAfter,
    });
    broadcastWallet(row.hostId);
  }
  if (withdrawalKind(row) === 'host') {
    notifyHost(row.hostId, {
      type: 'withdrawal_update',
      title:
        status === 'agency_paid' || status === 'paid'
          ? 'Withdrawal approved'
          : status === 'agency_rejected' || status === 'failed'
            ? 'Withdrawal rejected'
            : 'Withdrawal processing',
      body:
        status === 'agency_paid'
          ? `${row.agencyName || 'Your agency'} approved ${row.amountCoins} coins.`
          : status === 'agency_rejected'
            ? `${row.agencyName || 'Your agency'} rejected the request; coins were returned.`
            : `${row.amountCoins} coin request is ${status}.`,
    });
  }
  persist();
  broadcastWs({ type: 'withdrawal:updated', payload: row });
  res.json({ ok: true, withdrawal: row });
});

app.post('/api/reports', (req, res) => {
  const reporterId = String(req.body?.reporterId || '').trim();
  const targetId = String(req.body?.targetId || '').trim();
  const reason = String(req.body?.reason || '').trim();
  if (!reporterId || !targetId || !reason) {
    res.status(400).json({ error: 'reporterId, targetId, reason required' });
    return;
  }
  const row: ReportRow = {
    id: `rpt_${randomUUID()}`,
    reporterId,
    reporterName: String(req.body?.reporterName || 'Host'),
    targetId,
    reason,
    details: String(req.body?.details || ''),
    createdAt: Date.now(),
    status: 'open',
  };
  reports.unshift(row);
  broadcastWs({ type: 'report:created', payload: row });
  res.json({ ok: true, id: row.id, report: row });
});

app.get('/api/admin/reports', (req, res) => {
  const key = String(req.query.key || req.headers['x-admin-key'] || '');
  if (!isAdminCredential(key)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.json({ reports: reports.slice(0, 100) });
});

app.post('/api/admin/reports/:id/resolve', (req, res) => {
  const key = String(req.body?.key || req.headers['x-admin-key'] || '');
  if (!isAdminCredential(key)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const id = String(req.params.id || '');
  const row = reports.find((r) => r.id === id);
  if (!row) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  row.status = 'resolved';
  res.json({ ok: true, report: row });
});

/* -------------------- WebSocket realtime -------------------- */
const wsClients = new Set<WebSocket>();
/** userId → open sockets (for targeted auto-call invites) */
const wsByUser = new Map<string, Set<WebSocket>>();

function broadcastWs(event: unknown) {
  const raw = JSON.stringify(event);
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) client.send(raw);
  }
}

function sendWsToUser(userId: string, event: unknown) {
  const set = wsByUser.get(userId);
  if (!set?.size) return false;
  const raw = JSON.stringify(event);
  let sent = false;
  for (const client of set) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(raw);
      sent = true;
    }
  }
  return sent;
}

function buildAutoCallCandidates(): CandidateHost[] {
  pruneHosts();
  const out: CandidateHost[] = [];
  for (const p of listPresence()) {
    if (!p.isOnline || !p.readyToCall) continue;
    const managed = getHost(p.id);
    const status = managed?.hostStatus || p.hostStatus || '';
    const verified = Boolean(
      managed?.isVerified || status === 'approved',
    );
    const callsEnabled = managed ? managed.callsEnabled !== false : true;
    if (!verified || !callsEnabled) continue;
    if (managed?.banned || managed?.suspended) continue;
    out.push({
      id: p.id,
      name: managed?.name || p.name || 'Host',
      avatarUrl: managed?.photoUrl || p.avatarUrl,
      country: managed?.country || p.country,
      language: managed?.languages?.[0],
      categories: managed?.categories || [],
      ratePerMinute: normalizeHostCallPrice(
        managed?.callPrice ?? p.ratePerMinute,
      ),
      isVerified: verified,
      hostStatus: status || 'approved',
      callsEnabled,
      readyToCall: p.readyToCall,
      isOnline: p.isOnline,
    });
  }
  return out;
}

function runAutoCallSchedulerTick() {
  expireStaleInvites();
  const due = listDueAutoCallUsers();
  if (!due.length) return;
  const candidates = buildAutoCallCandidates();
  if (!candidates.length) return;
  for (const userId of due.slice(0, 20)) {
    const picked = pickAutoCallHost(userId, candidates);
    if (!picked) continue;
    const created = createAutoInvite({
      userId,
      host: picked.host,
      matchScore: picked.score,
    });
    if ('error' in created) continue;
    markInvitePushed(created.id);
    sendWsToUser(userId, {
      type: 'auto_call:invite',
      payload: created,
    });
    persist();
  }
}

registerHostManagementRoutes(app, { requireAdmin: requireStaff, broadcastWs });

registerAvatarRoutes(app, {
  onSaved: (id, avatarUrl) => {
    if (id && avatarUrl) {
      const row = wallets.get(id) || ensureWallet(id);
      row.avatarUrl = avatarUrl;
      wallets.set(id, row);
      const existing = getPresence(id);
      if (existing) {
        const next = patchPresence(id, { avatarUrl });
        if (next) {
          broadcastWs({ type: 'host:presence', payload: next });
        }
      }
      broadcastWs({
        type: 'wallet:updated',
        payload: { userId: id, avatarUrl, displayName: row.displayName },
      });
    }
    persist();
  },
});

/* -------------------- Smart Auto Call -------------------- */
app.get('/api/auto-call/status', (req, res) => {
  const userId = String(req.query.userId || req.headers['x-user-id'] || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  res.json({ status: getAutoCallStatus(userId) });
});

app.post('/api/auto-call/prefs', (req, res) => {
  const userId = String(req.body?.userId || req.headers['x-user-id'] || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  const enabled = req.body?.enabled !== false && req.body?.enabled !== 'false';
  const prefs = setAutoCallPrefs(userId, Boolean(enabled));
  persist();
  res.json({ ok: true, prefs, status: getAutoCallStatus(userId) });
});

app.post('/api/auto-call/heartbeat', (req, res) => {
  const userId = String(req.body?.userId || req.headers['x-user-id'] || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  const wallet = wallets.get(userId);
  const bodyBalance = Number(req.body?.coinBalance);
  const coinBalance =
    wallet && typeof wallet.coinBalance === 'number'
      ? wallet.coinBalance
      : Number.isFinite(bodyBalance)
        ? Math.max(0, Math.floor(bodyBalance))
        : 0;
  const session = touchAutoCallHeartbeat({
    userId,
    coinBalance,
    language: req.body?.language ? String(req.body.language) : undefined,
    country: req.body?.country ? String(req.body.country) : undefined,
    interests: Array.isArray(req.body?.interests)
      ? req.body.interests.map(String)
      : undefined,
    following: Array.isArray(req.body?.following)
      ? req.body.following.map(String)
      : undefined,
    recentHostIds: Array.isArray(req.body?.recentHostIds)
      ? req.body.recentHostIds.map(String)
      : undefined,
    viewingHostId: req.body?.viewingHostId
      ? String(req.body.viewingHostId)
      : null,
    inCall: Boolean(req.body?.inCall),
    acceptedCall: Boolean(req.body?.acceptedCall),
  });
  // If user gained coins mid-session, cancel pending invite client-side too
  if (coinBalance >= 80 || session.inCall) {
    const pending = getPendingInvite(userId);
    if (pending) {
      cancelPendingForUser(
        userId,
        coinBalance >= 80 ? 'recharged' : 'in_call',
      );
    }
    sendWsToUser(userId, {
      type: 'auto_call:cancel',
      payload: { reason: coinBalance >= 80 ? 'recharged' : 'in_call' },
    });
  }
  res.json({
    ok: true,
    status: getAutoCallStatus(userId),
    pending: getPendingInvite(userId),
  });
});

app.get('/api/auto-call/pending', (req, res) => {
  const userId = String(req.query.userId || req.headers['x-user-id'] || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  res.json({ pending: getPendingInvite(userId), status: getAutoCallStatus(userId) });
});

app.post('/api/auto-call/respond', (req, res) => {
  const userId = String(req.body?.userId || req.headers['x-user-id'] || '').trim();
  const inviteId = String(req.body?.inviteId || '').trim();
  const action = String(req.body?.action || '').trim() === 'accept' ? 'accept' : 'decline';
  if (!userId || !inviteId) {
    res.status(400).json({ error: 'userId and inviteId required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  const result = respondAutoInvite({ userId, inviteId, action });
  if (!result.ok) {
    res.status(409).json({ error: result.error });
    return;
  }
  persist();
  res.json({ ok: true, invite: result.invite, status: getAutoCallStatus(userId) });
});

/**
 * Host-initiated invite — only when user has coins AND allowlisted
 * (following / recent / currently viewing). Never used for zero-balance spam.
 */
app.post('/api/auto-call/host-invite', (req, res) => {
  const hostId = String(req.body?.hostId || req.headers['x-user-id'] || '').trim();
  const userId = String(req.body?.userId || '').trim();
  if (!hostId || !userId) {
    res.status(400).json({ error: 'hostId and userId required' });
    return;
  }
  if (!requireUserMatch(req, res, hostId)) return;
  const wallet = ensureWallet(userId);
  if (wallet.coinBalance <= 0) {
    res.status(409).json({
      error: 'User has no coins — use zero-balance auto system instead',
    });
    return;
  }
  if (!hostMayInviteUser({ userId, hostId })) {
    res.status(403).json({
      error: 'User has not followed, viewed, or recently interacted with this host',
    });
    return;
  }
  const candidates = buildAutoCallCandidates().filter((h) => h.id === hostId);
  const host =
    candidates[0] ||
    (() => {
      const p = getPresence(hostId);
      const managed = getHost(hostId);
      if (!p?.isOnline || !p.readyToCall) return null;
      if (managed && managed.hostStatus !== 'approved') return null;
      return {
        id: hostId,
        name: managed?.name || p.name || 'Host',
        avatarUrl: managed?.photoUrl || p.avatarUrl,
        country: managed?.country || p.country,
        language: managed?.languages?.[0],
        categories: managed?.categories || [],
        ratePerMinute: normalizeHostCallPrice(
          managed?.callPrice ?? p.ratePerMinute,
        ),
        isVerified: true,
        hostStatus: 'approved',
        callsEnabled: true,
        readyToCall: true,
        isOnline: true,
      } satisfies CandidateHost;
    })();
  if (!host) {
    res.status(409).json({ error: 'Host not online / ready' });
    return;
  }
  // Ensure session knows balance > 0
  touchAutoCallHeartbeat({
    userId,
    coinBalance: wallet.coinBalance,
  });
  const created = createAutoInvite({
    userId,
    host,
    matchScore: 100,
    reason: 'host_manual_allowed',
  });
  if ('error' in created) {
    res.status(409).json({ error: created.error });
    return;
  }
  markInvitePushed(created.id);
  sendWsToUser(userId, { type: 'auto_call:invite', payload: created });
  persist();
  res.json({ ok: true, invite: created });
});

app.get('/api/auto-call/analytics', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  res.json({ events: listAutoCallAnalytics(limit) });
});

registerVideoLibraryRoutes(app, { requireAdmin });

registerHostAppUpdateRoutes(app, { requireAdmin, broadcastWs, onChange: persist });

/** Public Luma home banners (hero + swipe promos) */
app.get('/api/banners/home', (_req, res) => {
  const cfg = getHomeBanners();
  res.json({
    ok: true,
    hero: cfg.hero.enabled ? cfg.hero : null,
    promos: cfg.promos.filter((p) => p.enabled),
    updatedAt: cfg.updatedAt,
  });
});

app.get('/api/admin/banners/home', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ ok: true, banners: getHomeBanners() });
});

app.put('/api/admin/banners/home', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const saved = setHomeBanners(req.body || {});
  persist();
  broadcastWs({ type: 'banners:home', payload: saved });
  res.json({ ok: true, banners: saved });
});

registerAgencyRoutes(app, {
  isPlatformAdmin,
  requireStaff,
  onPersist: () => persist(),
  notifyHosts: (hostIds, msg) => {
    for (const hid of hostIds) {
      notifyHost(hid, {
        type: msg.kind || 'agency_message',
        title: msg.title,
        body: msg.body,
      });
    }
  },
  getHostRevenueSnapshot: () => {
    const hosts = listHosts();
    linkDemoHostsIfEmpty(hosts.map((h) => h.id));
    return hosts.map((h) => {
      const agencyId =
        getAgencyIdForHost(h.id) ||
        getAgencyIdForHost(h.hostId) ||
        undefined;
      const agency = agencyId ? getAgency(agencyId) : undefined;
      return {
        hostId: h.id,
        name: h.name,
        revenueGenerated: h.revenueGenerated || 0,
        revenueMonth: h.revenueMonth || 0,
        pendingEarnings: h.pendingEarnings || 0,
        paidEarnings: h.paidEarnings || 0,
        coinBalance: h.coinBalance || 0,
        categories: h.categories || [],
        callEarnings: h.callEarnings || 0,
        giftEarnings: h.giftEarnings || 0,
        liveEarnings: h.liveEarnings || 0,
        type: (agencyId ? 'agency' : 'individual') as 'agency' | 'individual',
        agencyId,
        agencyName: agency?.name,
      };
    });
  },
});

/** In-memory live rooms (Firebase is source of truth on clients; API mirrors for Luma) */
const liveRooms = new Map<string, Record<string, unknown>>();

/** Paid live entry entitlements — key: roomId:userId:sessionStartedAt */
const liveEntryEntitlements = new Map<
  string,
  { roomId: string; userId: string; hostId: string; coins: number; paidAt: number; sessionStartedAt: number }
>();

function liveEntryKey(roomId: string, userId: string, sessionStartedAt: number) {
  return `${roomId}:${userId}:${sessionStartedAt}`;
}

function clearLiveEntitlementsForRoom(roomId: string) {
  for (const [key, ent] of liveEntryEntitlements) {
    if (ent.roomId === roomId) liveEntryEntitlements.delete(key);
  }
}

function roomEntryFee(room: Record<string, unknown>): number {
  if (!room.entryLocked) return 0;
  return Math.max(0, Math.floor(Number(room.entryFee) || 0));
}

function hasLiveEntryAccess(
  room: Record<string, unknown>,
  userId: string,
): { allowed: boolean; entryFee: number; alreadyPaid: boolean; reason?: string } {
  const entryFee = roomEntryFee(room);
  if (entryFee <= 0) return { allowed: true, entryFee: 0, alreadyPaid: true };
  const roomId = String(room.id || '');
  const sessionStartedAt = Number(room.startedAt || room.createdAt || 0);
  const key = liveEntryKey(roomId, userId, sessionStartedAt);
  const paid = liveEntryEntitlements.has(key);
  return {
    allowed: paid,
    entryFee,
    alreadyPaid: paid,
    reason: paid ? undefined : 'payment_required',
  };
}

/** End all live rooms for a host (offline / TTL / force). */
function endLiveRoomsForHost(hostId: string, reason = 'host_offline') {
  const hid = String(hostId || '').trim();
  if (!hid) return 0;
  let n = 0;
  for (const [id, room] of liveRooms) {
    if (!room?.isLive) continue;
    if (String(room.hostId || room.id || '') !== hid) continue;
    const startedAt = Number(
      room.startedAt || room.createdAt || room.updatedAt || Date.now(),
    );
    const endedAt = Date.now();
    room.isLive = false;
    room.endedAt = endedAt;
    room.endReason = reason;
    liveRooms.set(id, room);
    pushLiveSession({
      id: String(room.id || id),
      hostId: hid,
      startedAt,
      endedAt,
      durationSec: Math.max(0, Math.floor((endedAt - startedAt) / 1000)),
      giftCoins: Math.max(0, Math.floor(Number(room.giftCoins) || 0)),
    });
    broadcastWs({ type: 'live:ended', payload: { id, reason } });
    clearLiveEntitlementsForRoom(String(room.id || id));
    n += 1;
  }
  if (n) persist();
  return n;
}

/** Drop live rooms whose host is gone OR heartbeat is stale */
const LIVE_ROOM_HEARTBEAT_TTL_MS = Number(
  process.env.LIVE_ROOM_HEARTBEAT_TTL_MS || 45_000,
);

function pruneZombieLiveRooms() {
  const now = Date.now();
  const hostIdsToEnd = new Set<string>();
  for (const [, room] of liveRooms) {
    if (!room?.isLive) continue;
    const hostId = String(room.hostId || room.id || '');
    if (!hostId) continue;
    const presence = getPresence(hostId);
    const updatedAt = Number(room.updatedAt || room.startedAt || 0);
    const staleHeartbeat =
      updatedAt > 0 && now - updatedAt > LIVE_ROOM_HEARTBEAT_TTL_MS;
    if (!presence || !presence.isOnline || !presence.isLive || staleHeartbeat) {
      hostIdsToEnd.add(hostId);
    }
  }
  for (const hostId of hostIdsToEnd) {
    const presence = getPresence(hostId);
    const reason =
      !presence || !presence.isOnline
        ? 'presence_expired'
        : !presence.isLive
          ? 'presence_not_live'
          : 'heartbeat_timeout';
    endLiveRoomsForHost(hostId, reason);
    if (presence) {
      patchPresence(hostId, { isLive: false });
    }
  }
}
/** Live room chat (API mirror when Firebase RTDB unavailable on user app) */
type LiveCommentRow = {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: number;
  kind: 'comment' | 'join' | 'leave' | 'follow' | 'system' | 'gift';
  giftEmoji?: string;
  giftCoins?: number;
};
const liveComments = new Map<string, LiveCommentRow[]>();

/** 1:1 DMs between Luma users and CoinCall hosts */
type DmMessageRow = {
  id: string;
  fromId: string;
  toId: string;
  fromName: string;
  fromAvatar?: string;
  text: string;
  imageUrl?: string;
  createdAt: number;
  kind: 'text' | 'image' | 'gift';
  giftId?: string;
  giftName?: string;
  giftEmoji?: string;
  giftCoins?: number;
  giftAnimationUrl?: string;
  giftSoundUrl?: string;
  giftTxnId?: string;
  deliveredAt?: number;
  readAt?: number;
};
type DmThreadMeta = {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  hostId: string;
  hostName: string;
  hostAvatar?: string;
  lastMessage: string;
  updatedAt: number;
};
const dmMessages = new Map<string, DmMessageRow[]>();
const dmThreads = new Map<string, DmThreadMeta>();

function dmChatId(a: string, b: string) {
  return [a, b].sort().join('_');
}

function upsertDmThread(input: {
  userId: string;
  userName: string;
  userAvatar?: string;
  hostId: string;
  hostName: string;
  hostAvatar?: string;
  lastMessage: string;
  at: number;
}) {
  const id = dmChatId(input.userId, input.hostId);
  const prev = dmThreads.get(id);
  dmThreads.set(id, {
    id,
    userId: input.userId,
    userName: input.userName || prev?.userName || 'Fan',
    userAvatar: input.userAvatar || prev?.userAvatar,
    hostId: input.hostId,
    hostName: input.hostName || prev?.hostName || 'Host',
    hostAvatar: input.hostAvatar || prev?.hostAvatar,
    lastMessage: input.lastMessage,
    updatedAt: input.at,
  });
  return dmThreads.get(id)!;
}

function pushDmMessage(
  row: Omit<DmMessageRow, 'id' | 'createdAt' | 'deliveredAt'> & {
    createdAt?: number;
    clientMessageId?: string;
  },
) {
  const chatId = dmChatId(row.fromId, row.toId);
  const list = dmMessages.get(chatId) || [];
  const requestedId = String(row.clientMessageId || '').trim().slice(0, 80);
  if (requestedId) {
    const existing = list.find((message) => message.id === requestedId);
    if (existing) return { chatId, msg: existing };
  }
  const now = row.createdAt || Date.now();
  const msg: DmMessageRow = {
    id: requestedId || randomUUID().slice(0, 12),
    createdAt: now,
    deliveredAt: now,
    fromId: row.fromId,
    toId: row.toId,
    fromName: row.fromName,
    fromAvatar: row.fromAvatar,
    text: row.text,
    imageUrl: row.imageUrl,
    kind: row.kind || (row.imageUrl ? 'image' : 'text'),
    giftId: row.giftId,
    giftName: row.giftName,
    giftEmoji: row.giftEmoji,
    giftCoins: row.giftCoins,
    giftAnimationUrl: row.giftAnimationUrl,
    giftSoundUrl: row.giftSoundUrl,
    giftTxnId: row.giftTxnId,
  };
  list.push(msg);
  while (list.length > 200) list.shift();
  dmMessages.set(chatId, list);
  return { chatId, msg };
}

function recordGiftDm(input: {
  userId: string;
  userName: string;
  hostId: string;
  giftId: string;
  giftName: string;
  giftEmoji: string;
  giftCoins: number;
  txnId: string;
  createdAt?: number;
}) {
  const host = getHost(input.hostId);
  const media = giftMedia(input.giftCoins);
  const { chatId, msg } = pushDmMessage({
    fromId: input.userId,
    toId: input.hostId,
    fromName: input.userName || 'Fan',
    text: `${input.giftEmoji} Sent ${input.giftName} · ${input.giftCoins.toLocaleString()} coins`,
    kind: 'gift',
    giftId: input.giftId,
    giftName: input.giftName,
    giftEmoji: input.giftEmoji,
    giftCoins: input.giftCoins,
    giftAnimationUrl: media.animationUrl,
    giftSoundUrl: media.soundUrl,
    giftTxnId: input.txnId,
    createdAt: input.createdAt,
    clientMessageId: `gift_${input.txnId}`,
  });
  const thread = upsertDmThread({
    userId: input.userId,
    userName: input.userName || 'Fan',
    hostId: input.hostId,
    hostName: host?.name || 'Host',
    hostAvatar: host?.avatarUrl,
    lastMessage: `${input.giftEmoji} ${input.giftName} · ${input.giftCoins.toLocaleString()} coins`,
    at: msg.createdAt,
  });
  const payload = { chatId, message: msg, thread };
  broadcastWs({ type: 'dm:message', payload });
  pushToHost(input.hostId, 'dm_message', payload);
  return payload;
}

function pushLiveComment(roomId: string, row: Omit<LiveCommentRow, 'id' | 'createdAt'> & { createdAt?: number }) {
  const list = liveComments.get(roomId) || [];
  const comment: LiveCommentRow = {
    id: randomUUID().slice(0, 10),
    createdAt: row.createdAt || Date.now(),
    userId: row.userId,
    userName: row.userName,
    text: row.text,
    kind: row.kind,
    giftEmoji: row.giftEmoji,
    giftCoins: row.giftCoins,
  };
  list.push(comment);
  while (list.length > 120) list.shift();
  liveComments.set(roomId, list);
  broadcastWs({ type: 'live:comment', payload: { roomId, comment } });
  return comment;
}

function findLiveRoom(idOrHost: string) {
  const key = String(idOrHost || '');
  if (!key) return undefined;
  if (liveRooms.has(key)) return { id: key, room: liveRooms.get(key)! };
  const asLive = key.startsWith('live_') ? key : `live_${key}`;
  if (liveRooms.has(asLive)) return { id: asLive, room: liveRooms.get(asLive)! };
  for (const [id, room] of liveRooms.entries()) {
    if (String(room.hostId || '') === key && room.isLive) {
      return { id, room };
    }
  }
  return undefined;
}

function buildSnapshot(): PersistedSnapshot {
  return {
    version: 1,
    savedAt: Date.now(),
    wallets: [...wallets.values()] as Array<Record<string, unknown>>,
    walletLedger: [...walletLedger.entries()].map(([userId, entries]) => ({
      userId,
      entries: entries as Array<Record<string, unknown>>,
    })),
    withdrawals: withdrawals as Array<Record<string, unknown>>,
    reports: reports as Array<Record<string, unknown>>,
    massTextHistory: massTextHistory as Array<Record<string, unknown>>,
    iapReceipts: [...iapReceipts],
    supportTickets: supportTickets as Array<Record<string, unknown>>,
    liveRooms: [...liveRooms.values()] as Array<Record<string, unknown>>,
    dmChats: [...dmThreads.values()].map((t) => ({
      ...t,
      messages: dmMessages.get(t.id) || [],
    })) as Array<Record<string, unknown>>,
    callHistory: callHistory as unknown as Array<Record<string, unknown>>,
    giftHistory: giftHistory as unknown as Array<Record<string, unknown>>,
    liveSessionHistory: liveSessionHistory as unknown as Array<Record<string, unknown>>,
    avatars: dumpAvatarsForSnapshot(2_500_000),
    welcomeBonusPaidIds: [...welcomeBonusPaidIds],
    rewards: dumpRewardsForSnapshot() as unknown as PersistedSnapshot['rewards'],
    autoCall: dumpAutoCallForSnapshot() as unknown as PersistedSnapshot['autoCall'],
    hostFollowers: [...hostFollowers.entries()].map(([hostId, set]) => ({
      hostId,
      userIds: [...set],
    })),
    coinTxns: dumpCoinTxns() as unknown as Array<Record<string, unknown>>,
    homeBanners: dumpHomeBannersForSnapshot() as unknown as Record<string, unknown>,
    pricingConfig: publicPricingConfig() as unknown as Record<string, unknown>,
    installUserMap: [...installUserMap.entries()].map(([installId, userId]) => ({
      installId,
      userId,
    })),
    userAccounts: dumpUserAccounts() as unknown as Array<Record<string, unknown>>,
    ...dumpAgenciesForSnapshot(),
    ...dumpManagedHostsForSnapshot(),
    hostAppUpdate: dumpHostAppUpdateForSnapshot() as unknown as Record<string, unknown>,
  };
}

function persist() {
  scheduleSave(buildSnapshot);
}

function restoreFromDisk() {
  const snap = loadSnapshot();
  if (!snap) return;
  if (Array.isArray(snap.userAccounts)) {
    loadUserAccounts(snap.userAccounts as unknown as ReturnType<typeof dumpUserAccounts>);
  }
  for (const w of snap.wallets || []) {
    const row = w as unknown as WalletRow;
    if (row?.userId) {
      wallets.set(row.userId, row);
      if (row.welcomeBonusGranted) welcomeBonusPaidIds.add(row.userId);
    }
  }
  for (const block of snap.walletLedger || []) {
    if (block?.userId && Array.isArray(block.entries)) {
      walletLedger.set(block.userId, block.entries as unknown as LedgerEntry[]);
      if (
        (block.entries as LedgerEntry[]).some(
          (e) =>
            e.kind === 'credit' &&
            /welcome\s*bonus/i.test(String(e.reason || '')),
        )
      ) {
        welcomeBonusPaidIds.add(block.userId);
      }
    }
  }
  for (const id of snap.welcomeBonusPaidIds || []) {
    if (id) welcomeBonusPaidIds.add(String(id));
  }
  if (snap.rewards) {
    loadRewardsFromSnapshot(
      snap.rewards as {
        claims?: Array<{ userId: string }>;
        welcomeInstallIds?: string[];
      },
    );
  }
  if (snap.autoCall) {
    loadAutoCallFromSnapshot(
      snap.autoCall as {
        prefs?: Array<{ userId: string; enabled: boolean; updatedAt: number }>;
        analytics?: AutoCallAnalyticsEvent[];
      },
    );
  }
  if (Array.isArray(snap.hostFollowers)) {
    hostFollowers.clear();
    for (const row of snap.hostFollowers) {
      const hostId = String(row?.hostId || '').trim();
      if (!hostId || !Array.isArray(row.userIds)) continue;
      hostFollowers.set(
        hostId,
        new Set(row.userIds.map((u) => String(u)).filter(Boolean)),
      );
    }
  }
  if (Array.isArray(snap.installUserMap)) {
    installUserMap.clear();
    for (const row of snap.installUserMap) {
      const installId = String(row?.installId || '').trim();
      const userId = String(row?.userId || '').trim();
      if (installId && userId) installUserMap.set(installId, userId);
    }
  }
  if (Array.isArray(snap.coinTxns)) {
    loadCoinTxns(snap.coinTxns as unknown as CoinTxn[]);
  }
  if (snap.homeBanners) loadHomeBannersFromSnapshot(snap.homeBanners);
  if (snap.pricingConfig) {
    const raw = snap.pricingConfig as {
      coinPackages?: typeof IAP_PRODUCTS;
      vipPlans?: typeof VIP_PLANS;
      callBilling?: { rateUnitCoins?: number };
      updatedAt?: number;
    };
    if (Array.isArray(raw.coinPackages) && raw.coinPackages.length) {
      IAP_PRODUCTS.splice(0, IAP_PRODUCTS.length, ...raw.coinPackages);
    }
    if (Array.isArray(raw.vipPlans) && raw.vipPlans.length) {
      VIP_PLANS = raw.vipPlans;
    }
    if (raw.callBilling?.rateUnitCoins !== undefined) {
      configureRateUnitCoins(raw.callBilling.rateUnitCoins);
    }
    pricingUpdatedAt = Number(raw.updatedAt) || pricingUpdatedAt;
  }
  if (Array.isArray(snap.withdrawals)) {
    withdrawals.length = 0;
    withdrawals.push(...(snap.withdrawals as unknown as WithdrawalRequest[]));
  }
  if (Array.isArray(snap.reports)) {
    reports.length = 0;
    reports.push(...(snap.reports as unknown as ReportRow[]));
  }
  for (const token of snap.iapReceipts || []) iapReceipts.add(String(token));
  if (Array.isArray(snap.massTextHistory)) {
    massTextHistory.length = 0;
    massTextHistory.push(
      ...(snap.massTextHistory as unknown as typeof massTextHistory),
    );
  }
  if (Array.isArray(snap.supportTickets)) {
    supportTickets.length = 0;
    supportTickets.push(
      ...(snap.supportTickets as unknown as SupportTicket[]),
    );
  }
  for (const room of snap.liveRooms || []) {
    const id = String((room as { id?: string }).id || '');
    if (id && (room as { isLive?: boolean }).isLive) {
      liveRooms.set(id, room);
    }
  }
  for (const chat of snap.dmChats || []) {
    const id = String((chat as { id?: string }).id || '');
    if (!id) continue;
    const row = chat as DmThreadMeta & { messages?: DmMessageRow[] };
    dmThreads.set(id, {
      id,
      userId: String(row.userId || ''),
      userName: String(row.userName || 'Fan'),
      userAvatar: row.userAvatar ? String(row.userAvatar) : undefined,
      hostId: String(row.hostId || ''),
      hostName: String(row.hostName || 'Host'),
      hostAvatar: row.hostAvatar ? String(row.hostAvatar) : undefined,
      lastMessage: String(row.lastMessage || ''),
      updatedAt: Number(row.updatedAt || Date.now()),
    });
    if (Array.isArray(row.messages)) {
      dmMessages.set(id, row.messages);
    }
  }
  if (Array.isArray(snap.callHistory)) {
    callHistory.length = 0;
    callHistory.push(...(snap.callHistory as unknown as CallHistoryRecord[]));
  }
  if (Array.isArray(snap.giftHistory)) {
    giftHistory.length = 0;
    giftHistory.push(...(snap.giftHistory as unknown as GiftHistoryRecord[]));
  }
  if (Array.isArray(snap.liveSessionHistory)) {
    liveSessionHistory.length = 0;
    liveSessionHistory.push(
      ...(snap.liveSessionHistory as unknown as LiveSessionRecord[]),
    );
  }
  const restoredAvatars = restoreAvatarsFromSnapshot(
    snap.avatars as Parameters<typeof restoreAvatarsFromSnapshot>[0],
  );
  loadAgenciesFromSnapshot({
    agencies: snap.agencies,
    hostAgency: snap.hostAgency,
    announcements: snap.announcements,
  });
  const restoredHosts = loadManagedHostsFromSnapshot(snap.managedHosts);
  loadHostAppUpdateFromSnapshot(snap.hostAppUpdate);
  console.log(
    `[persist] restored wallets=${wallets.size} withdrawals=${withdrawals.length} liveRooms=${liveRooms.size} dm=${dmThreads.size} calls=${callHistory.length} gifts=${giftHistory.length} liveSessions=${liveSessionHistory.length} avatars=${restoredAvatars} agencies=${snap.agencies?.length ?? 0} hosts=${restoredHosts}`,
  );
}

restoreFromDisk();

async function applyMongoOrDisk() {
  const ok = await initMongo();
  if (!ok) return;
  await ensurePaymentIndexes();
  console.log('[payments] Mongo indexes and product catalog ready');
  const snap = await loadMongoSnapshot();
  if (!snap) {
    // First Atlas connect: push disk/RAM state so both apps share durable cloud data
    console.log('[persist] Mongo empty — seeding from disk/in-memory snapshot');
    try {
      saveNow(buildSnapshot);
    } catch (e) {
      console.warn('[persist] Mongo seed failed', e);
    }
    return;
  }
  if (Array.isArray(snap.userAccounts)) {
    loadUserAccounts(snap.userAccounts as unknown as ReturnType<typeof dumpUserAccounts>);
  }
  for (const w of snap.wallets || []) {
    const row = w as unknown as WalletRow;
    if (row?.userId) {
      wallets.set(row.userId, row);
      if (row.welcomeBonusGranted) welcomeBonusPaidIds.add(row.userId);
    }
  }
  for (const block of snap.walletLedger || []) {
    if (block?.userId && Array.isArray(block.entries)) {
      walletLedger.set(block.userId, block.entries as unknown as LedgerEntry[]);
      if (
        (block.entries as LedgerEntry[]).some(
          (e) =>
            e.kind === 'credit' &&
            /welcome\s*bonus/i.test(String(e.reason || '')),
        )
      ) {
        welcomeBonusPaidIds.add(block.userId);
      }
    }
  }
  for (const id of snap.welcomeBonusPaidIds || []) {
    if (id) welcomeBonusPaidIds.add(String(id));
  }
  if (snap.rewards) {
    loadRewardsFromSnapshot(
      snap.rewards as {
        claims?: Array<{ userId: string }>;
        welcomeInstallIds?: string[];
      },
    );
  }
  if (snap.autoCall) {
    loadAutoCallFromSnapshot(
      snap.autoCall as {
        prefs?: Array<{ userId: string; enabled: boolean; updatedAt: number }>;
        analytics?: AutoCallAnalyticsEvent[];
      },
    );
  }
  if (Array.isArray(snap.hostFollowers)) {
    hostFollowers.clear();
    for (const row of snap.hostFollowers) {
      const hostId = String(row?.hostId || '').trim();
      if (!hostId || !Array.isArray(row.userIds)) continue;
      hostFollowers.set(
        hostId,
        new Set(row.userIds.map((u) => String(u)).filter(Boolean)),
      );
    }
  }
  if (Array.isArray(snap.installUserMap)) {
    installUserMap.clear();
    for (const row of snap.installUserMap) {
      const installId = String(row?.installId || '').trim();
      const userId = String(row?.userId || '').trim();
      if (installId && userId) installUserMap.set(installId, userId);
    }
  }
  if (Array.isArray(snap.coinTxns)) {
    loadCoinTxns(snap.coinTxns as unknown as CoinTxn[]);
  }
  if (snap.homeBanners) loadHomeBannersFromSnapshot(snap.homeBanners);
  if (Array.isArray(snap.withdrawals)) {
    withdrawals.length = 0;
    withdrawals.push(...(snap.withdrawals as unknown as WithdrawalRequest[]));
  }
  if (Array.isArray(snap.reports)) {
    reports.length = 0;
    reports.push(...(snap.reports as unknown as ReportRow[]));
  }
  for (const token of snap.iapReceipts || []) iapReceipts.add(String(token));
  if (Array.isArray(snap.massTextHistory)) {
    massTextHistory.length = 0;
    massTextHistory.push(
      ...(snap.massTextHistory as unknown as typeof massTextHistory),
    );
  }
  if (Array.isArray(snap.supportTickets)) {
    supportTickets.length = 0;
    supportTickets.push(
      ...(snap.supportTickets as unknown as SupportTicket[]),
    );
  }
  for (const room of snap.liveRooms || []) {
    const id = String((room as { id?: string }).id || '');
    if (id && (room as { isLive?: boolean }).isLive) {
      liveRooms.set(id, room);
    }
  }
  if (Array.isArray(snap.callHistory)) {
    callHistory.length = 0;
    callHistory.push(...(snap.callHistory as unknown as CallHistoryRecord[]));
  }
  if (Array.isArray(snap.giftHistory)) {
    giftHistory.length = 0;
    giftHistory.push(...(snap.giftHistory as unknown as GiftHistoryRecord[]));
  }
  if (Array.isArray(snap.liveSessionHistory)) {
    liveSessionHistory.length = 0;
    liveSessionHistory.push(
      ...(snap.liveSessionHistory as unknown as LiveSessionRecord[]),
    );
  }
  const restoredAvatars = restoreAvatarsFromSnapshot(
    snap.avatars as Parameters<typeof restoreAvatarsFromSnapshot>[0],
  );
  loadAgenciesFromSnapshot({
    agencies: snap.agencies,
    hostAgency: snap.hostAgency,
    announcements: snap.announcements,
  });
  const restoredHosts = loadManagedHostsFromSnapshot(snap.managedHosts);
  loadHostAppUpdateFromSnapshot(snap.hostAppUpdate);
  console.log(
    `[persist] restored from Mongo wallets=${wallets.size} withdrawals=${withdrawals.length} calls=${callHistory.length} gifts=${giftHistory.length} liveSessions=${liveSessionHistory.length} avatars=${restoredAvatars} agencies=${snap.agencies?.length ?? 0} hosts=${restoredHosts}`,
  );
}

app.get('/api/ready', (_req, res) => {
  pruneHosts();
  res.json({
    ok: true,
    agoraConfigured: Boolean(APP_ID && APP_CERT),
    onlineHosts: presenceCountOnline(),
    readyHosts: listPresence().filter((h) => h.readyToCall).length,
    wallets: wallets.size,
    liveRooms: [...liveRooms.values()].filter((r) => r.isLive).length,
    withdrawals: withdrawals.length,
    managedHosts: listHosts().length,
    persistence: persistenceLabel(),
    mongoConfigured: mongoConfigured(),
    realtime: 'ws',
    media: {
      photos: 'firebase-storage+api-avatar-fallback',
      database: 'mongodb-optional+disk-snapshot',
    },
    iapStubAllowed:
      process.env.ALLOW_IAP_STUB === '1' || process.env.NODE_ENV !== 'production',
  });
});

app.post('/api/live/rooms', (req, res) => {
  const room = { ...(req.body as Record<string, unknown>) };
  const id = String(room?.id || '');
  if (!id) {
    res.status(400).json({ error: 'id required' });
    return;
  }
  const hostId = String(room.hostId || '');
  const hostName = String(room.hostName || 'Host');
  const previous = liveRooms.get(id);
  const incomingStartedAt = Number(room.startedAt || room.createdAt || 0);
  const previousStartedAt = Number(
    previous?.startedAt || previous?.createdAt || 0,
  );
  const sameSession = Boolean(
    previous?.isLive &&
      previousStartedAt > 0 &&
      incomingStartedAt > 0 &&
      Math.abs(incomingStartedAt - previousStartedAt) < 2_000,
  );
  if (sameSession && previous) {
    // Server gift totals only grow during a single live session.
    room.giftCoins = Math.max(
      Number(previous.giftCoins || 0),
      Number(room.giftCoins || 0),
    );
    // A heartbeat created before a lock action cannot revert that action.
    const previousLockVersion = Math.max(
      0,
      Math.floor(Number(previous.lockVersion) || 0),
    );
    const incomingLockVersion = Math.max(
      0,
      Math.floor(Number(room.lockVersion) || 0),
    );
    if (previousLockVersion > incomingLockVersion) {
      room.entryLocked = Boolean(previous.entryLocked);
      room.entryFee = Number(previous.entryFee || 0);
      room.lockVersion = previousLockVersion;
      room.lockUpdatedAt = previous.lockUpdatedAt;
    }
  }
  if (!Number.isFinite(Number(room.lockVersion))) {
    room.lockVersion = room.entryLocked ? 1 : 0;
  }
  if (hostId) {
    const gate = assertHostCanReceiveCalls(hostId);
    if (!gate.ok) {
      res.status(gate.status || 403).json({ error: gate.error });
      return;
    }
  }
  // Convert data:/blob: to API-hosted public URL; never leave empty for Luma
  for (const key of ['hostAvatar', 'thumbnailUrl'] as const) {
    const v = room[key];
    if (typeof v !== 'string' || !v) continue;
    if (v.startsWith('data:') || v.startsWith('blob:')) {
      if (hostId) {
        const saved = saveHostAvatar(hostId, v);
        room[key] = saved.ok && saved.url ? saved.url : '';
      } else {
        room[key] = '';
      }
    } else if (!isPublicHttpAvatar(v)) {
      room[key] = '';
    }
  }
  // Enrich empty avatar from presence / managed / stored / default (name, not UID)
  if (hostId) {
    const presence = getPresence(hostId);
    const managed = getHost(hostId);
    const stored = hasStoredAvatar(hostId) ? avatarPublicUrl(hostId, req) : '';
    const resolved = pickHostAvatarUrl(
      {
        avatarUrl: room.hostAvatar ? String(room.hostAvatar) : undefined,
        thumbnailUrl: room.thumbnailUrl ? String(room.thumbnailUrl) : undefined,
        photoUrl: managed?.photoUrl || presence?.avatarUrl,
        photoUrls: managed?.photoUrls,
        hostAvatar: stored || undefined,
      },
      { hostId, name: hostName },
    );
    room.hostAvatar = resolved;
    if (!room.thumbnailUrl) room.thumbnailUrl = resolved;
  }
  liveRooms.set(id, {
    ...room,
    startedAt: Number(room.startedAt || room.createdAt || Date.now()),
    updatedAt: Date.now(),
  });
  if (hostId) {
    const existing = getPresence(hostId);
    if (existing) {
      patchPresence(hostId, {
        isLive: true,
        isOnline: true,
        avatarUrl: String(room.hostAvatar || existing.avatarUrl || ''),
      });
    } else {
      upsertPresence({
        id: hostId,
        name: hostName,
        avatarUrl: room.hostAvatar ? String(room.hostAvatar) : undefined,
        ratePerMinute: DEFAULT_HOST_CALL_PRICE,
        isOnline: true,
        isLive: true,
        isOnCall: false,
        readyToCall: false,
        lastSeen: Date.now(),
      });
    }
  }
  broadcastWs({ type: 'live:room', payload: room });
  persist();
  res.json({ ok: true, room });
});

app.get('/api/live/rooms', (req, res) => {
  pruneHosts();
  pruneZombieLiveRooms();
  const rooms = [...liveRooms.values()]
    .filter((r) => {
      if (!r.isLive || String(r.mode || 'solo') === 'party') return false;
      const hostId = String(r.hostId || r.id || '');
      const presence = hostId ? getPresence(hostId) : undefined;
      // Host must still be online AND actively live — never show stale/cached live
      return Boolean(presence?.isOnline && presence.isLive && r.isLive);
    })
    .map((r) => {
      const hostId = String(r.hostId || r.id || 'host');
      const hostName = String(r.hostName || 'Host');
      const presence = getPresence(hostId);
      const managed = getHost(hostId);
      const stored = hasStoredAvatar(hostId) ? avatarPublicUrl(hostId, req) : '';
      const out = { ...r };
      const resolved = pickHostAvatarUrl(
        {
          avatarUrl: out.hostAvatar ? String(out.hostAvatar) : undefined,
          thumbnailUrl: out.thumbnailUrl ? String(out.thumbnailUrl) : undefined,
          photoUrl: managed?.photoUrl || presence?.avatarUrl,
          photoUrls: managed?.photoUrls,
          hostAvatar: stored || undefined,
        },
        { hostId, name: hostName },
      );
      out.hostAvatar = resolved;
      out.thumbnailUrl = resolved;
      return out;
    });
  res.json({ rooms });
});

/** Resolve a host-only live room by room id or host id */
app.get('/api/live/rooms/:id', (req, res) => {
  const found = findLiveRoom(String(req.params.id || ''));
  if (!found || !found.room.isLive) {
    res.status(404).json({ error: 'Live room not found' });
    return;
  }
  if (String(found.room.mode || 'solo') === 'party') {
    res.status(404).json({ error: 'Party rooms are not available in Host-Only Live' });
    return;
  }
  const hostId = String(found.room.hostId || found.id);
  const out: Record<string, unknown> = { ...found.room, id: found.id };
  for (const key of ['hostAvatar', 'thumbnailUrl'] as const) {
    const v = out[key];
    if (
      typeof v === 'string' &&
      (v.startsWith('data:') ||
        v.startsWith('blob:') ||
        !isPublicHttpAvatar(v))
    ) {
      out[key] = '';
    }
  }
  res.json({
    room: out,
    channel: String(found.room.channel || found.id),
    giftCoins: Number(found.room.giftCoins || 0),
    viewers: Number(found.room.viewers || 0),
  });
});

app.get('/api/live/rooms/:id/comments', (req, res) => {
  const found = findLiveRoom(String(req.params.id || ''));
  if (!found) {
    // Soft-empty so clients can poll before room mirrors to API
    res.json({ comments: [] });
    return;
  }
  const list = liveComments.get(found.id) || [];
  res.json({ comments: list.slice(-80), roomId: found.id });
});

app.post('/api/live/rooms/:id/comments', (req, res) => {
  const rawId = String(req.params.id || '');
  let found = findLiveRoom(rawId);
  if (!found || !found.room.isLive) {
    // Soft-create so chat works even if room only exists on host Firebase
    const hostId = String(
      req.body?.hostId || (rawId.startsWith('live_') ? rawId.slice(5) : rawId),
    ).trim();
    if (!hostId) {
      res.status(404).json({ error: 'Live room not found' });
      return;
    }
    const presence = getPresence(hostId);
    const roomId = rawId.startsWith('live_') ? rawId : `live_${hostId}`;
    const room = {
      id: roomId,
      hostId,
      hostName: String(req.body?.hostName || presence?.name || 'Host'),
      channel: roomId,
      isLive: true,
      mode: 'solo',
      viewers: Number(presence ? 1 : 0),
      giftCoins: 0,
      updatedAt: Date.now(),
    };
    liveRooms.set(roomId, room);
    if (presence) patchPresence(hostId, { isLive: true, isOnline: true });
    found = { id: roomId, room };
  }
  const userId = String(req.body?.userId || '').trim().slice(0, 64);
  const userName = String(req.body?.userName || 'Viewer').trim().slice(0, 40) || 'Viewer';
  const text = String(req.body?.text || '').trim().slice(0, 200);
  if (!userId || !text) {
    res.status(400).json({ error: 'userId and text required' });
    return;
  }
  const comment = pushLiveComment(found.id, {
    userId,
    userName,
    text,
    kind: 'comment',
  });
  pushToHost(String(found.room.hostId || ''), 'live_comment', {
    roomId: found.id,
    comment,
  });
  res.status(201).json({ ok: true, comment, roomId: found.id });
});

/** Viewer join / leave — bumps room viewer count for the active live list */
app.post('/api/live/rooms/:id/viewers', (req, res) => {
  const found = findLiveRoom(String(req.params.id || ''));
  if (!found || !found.room.isLive) {
    res.status(404).json({ error: 'Live room not found' });
    return;
  }
  const delta = Math.max(-5, Math.min(5, Math.floor(Number(req.body?.delta) || 0)));
  const userId = String(req.body?.userId || 'viewer').slice(0, 64);
  const userName = String(req.body?.userName || 'Viewer').slice(0, 40);
  const next = Math.max(0, Number(found.room.viewers || 0) + delta);
  found.room.viewers = next;
  found.room.updatedAt = Date.now();
  liveRooms.set(found.id, found.room);
  if (delta > 0) {
    pushLiveComment(found.id, {
      userId,
      userName,
      text: 'joined',
      kind: 'join',
    });
  }
  broadcastWs({
    type: 'live:viewers',
    payload: { roomId: found.id, viewers: next },
  });
  persist();
  res.json({ ok: true, viewers: next });
});

app.post('/api/live/rooms/:id/end', (req, res) => {
  const id = String(req.params.id || '');
  const room = liveRooms.get(id);
  if (room) {
    const hostId = String(room.hostId || req.body?.hostId || '');
    const startedAt = Number(
      room.startedAt || room.createdAt || room.updatedAt || Date.now(),
    );
    const endedAt = Date.now();
    room.isLive = false;
    room.endedAt = endedAt;
    liveRooms.set(id, room);
    if (hostId) {
      pushLiveSession({
        id: String(room.id || id),
        hostId,
        startedAt,
        endedAt,
        durationSec: Math.max(0, Math.floor((endedAt - startedAt) / 1000)),
        giftCoins: Math.max(0, Math.floor(Number(room.giftCoins) || 0)),
      });
      if (getPresence(hostId)) {
        patchPresence(hostId, { isLive: false });
      }
    } else {
      persist();
    }
  }
  broadcastWs({ type: 'live:ended', payload: { id } });
  clearLiveEntitlementsForRoom(id);
  res.json({ ok: true });
});

app.post('/api/live/rooms/:id/title', (req, res) => {
  const id = String(req.params.id || '');
  const title = String(req.body?.title || '').trim().slice(0, 48);
  const room = liveRooms.get(id);
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  if (!title) {
    res.status(400).json({ error: 'title required' });
    return;
  }
  room.title = title;
  room.updatedAt = Date.now();
  liveRooms.set(id, room);
  broadcastWs({ type: 'live:title', payload: { id, title } });
  res.json({ ok: true, room });
});

/** Host toggles Premium / coin-lock mid-live (server authoritative) */
app.patch('/api/live/rooms/:id/lock', (req, res) => {
  const id = String(req.params.id || '');
  const room = liveRooms.get(id) || findLiveRoom(id)?.room;
  if (!room || !room.isLive) {
    res.status(404).json({ error: 'Live room not found' });
    return;
  }
  const hostId = String(
    req.headers['x-user-id'] || req.body?.hostId || room.hostId || '',
  );
  if (!hostId || String(room.hostId || '') !== hostId) {
    res.status(403).json({ error: 'Only the live host can change lock' });
    return;
  }
  if (!requireUserMatch(req, res, hostId)) return;
  const entryLocked = Boolean(req.body?.entryLocked);
  const entryFee = entryLocked
    ? Math.max(10, Math.min(9999, Math.floor(Number(req.body?.entryFee) || 50)))
    : 0;
  room.entryLocked = entryLocked;
  room.entryFee = entryFee;
  room.lockVersion =
    Math.max(0, Math.floor(Number(room.lockVersion) || 0)) + 1;
  room.lockUpdatedAt = Date.now();
  room.updatedAt = Date.now();
  liveRooms.set(String(room.id || id), room);
  broadcastWs({
    type: 'live:lock',
    payload: {
      id: String(room.id || id),
      roomId: String(room.id || id),
      hostId: String(room.hostId || ''),
      channel: String(room.channel || room.id || id),
      entryLocked,
      entryFee,
      lockVersion: room.lockVersion,
      updatedAt: room.updatedAt,
    },
  });
  // Backward-compatible room update for viewers already subscribed to live:room.
  broadcastWs({
    type: 'live:room',
    payload: {
      id: String(room.id || id),
      roomId: String(room.id || id),
      hostId: String(room.hostId || ''),
      channel: String(room.channel || room.id || id),
      entryLocked,
      entryFee,
      locked: entryLocked,
      unlockCoins: entryFee,
      lockVersion: room.lockVersion,
      updatedAt: room.updatedAt,
    },
  });
  persist();
  res.json({
    ok: true,
    roomId: String(room.id || id),
    entryLocked,
    entryFee,
    lockVersion: room.lockVersion,
  });
});

/** Announce a viewer recharge into a live room (user app / host demo). */
app.post('/api/live/rooms/:id/recharge', (req, res) => {
  const id = String(req.params.id || '');
  const room = liveRooms.get(id);
  if (!room || !room.isLive) {
    res.status(404).json({ error: 'Live room not found' });
    return;
  }
  const userName = String(req.body?.userName || 'Viewer').slice(0, 40);
  const userId = String(req.body?.userId || 'viewer').slice(0, 64);
  const coins = Math.max(1, Math.floor(Number(req.body?.coins) || 0));
  const event = recordUserRecharge({ userId, userName, coins, roomId: id });
  pushToHost(String(room.hostId || ''), 'viewer_recharge', event);
  res.json({ ok: true, recharge: event });
});

/** Check whether a viewer may enter a coin-locked live room */
app.get('/api/live/rooms/:id/access', (req, res) => {
  const found = findLiveRoom(req.params.id);
  if (!found?.room?.isLive) {
    res.status(404).json({ error: 'Live room not found', allowed: false });
    return;
  }
  const userId = String(req.query.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  const access = hasLiveEntryAccess(found.room, userId);
  res.json({
    roomId: found.id,
    hostId: String(found.room.hostId || ''),
    entryLocked: Boolean(found.room.entryLocked),
    entryFee: access.entryFee,
    allowed: access.allowed,
    alreadyPaid: access.alreadyPaid,
    reason: access.reason,
  });
});

/** Pay coins to enter a locked live session (idempotent per session) */
app.post('/api/live/rooms/:id/join', (req, res) => {
  const found = findLiveRoom(req.params.id);
  if (!found?.room?.isLive) {
    res.status(404).json({ error: 'Live room not found' });
    return;
  }
  const room = found.room;
  const roomId = found.id;
  const userId = String(req.body?.userId || '').trim();
  const userName = String(req.body?.userName || 'Viewer').slice(0, 40);
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  const hostId = String(room.hostId || '');
  const entryFee = roomEntryFee(room);
  if (entryFee <= 0) {
    res.json({
      ok: true,
      free: true,
      entryFee: 0,
      wallet: walletPublic(ensureWallet(userId)),
    });
    return;
  }

  const sessionStartedAt = Number(room.startedAt || room.createdAt || Date.now());
  const key = liveEntryKey(roomId, userId, sessionStartedAt);
  const existing = liveEntryEntitlements.get(key);
  if (existing) {
    res.json({
      ok: true,
      alreadyPaid: true,
      entryFee,
      entitlement: existing,
      wallet: walletPublic(ensureWallet(userId)),
    });
    return;
  }

  const txnKey =
    String(req.headers['idempotency-key'] || req.body?.txnKey || '').trim() ||
    `live_entry:${roomId}:${userId}:${sessionStartedAt}`;
  const xfer = transferUserToHost(coinDeps(), {
    txnKey,
    type: 'live_entry',
    userId,
    hostId,
    gross: entryFee,
    reason: `live_entry_${roomId}`,
    meta: { roomId, sessionStartedAt },
    userDisplayName: userName,
    hostDisplayName: String(room.hostName || 'Host'),
  });
  if (!xfer.ok) {
    res.status(xfer.code).json({
      error: xfer.txn.error || 'Insufficient coins',
      need: entryFee,
      wallet: walletPublic(ensureWallet(userId)),
      txn: xfer.txn,
    });
    return;
  }

  const hostWallet = ensureWallet(hostId);
  recordHostEarning(hostId, xfer.txn.coinsCreditedHost, {
    kind: 'live',
    coinBalance: hostWallet.coinBalance,
    broadcast: broadcastWs,
  });

  const entitlement = {
    roomId,
    userId,
    hostId,
    coins: entryFee,
    paidAt: Date.now(),
    sessionStartedAt,
  };
  liveEntryEntitlements.set(key, entitlement);

  broadcastWs({
    type: 'live:entry:paid',
    payload: { roomId, userId, userName, coins: entryFee, hostId },
  });

  persist();
  res.json({
    ok: true,
    entryFee,
    entitlement,
    txnId: xfer.txn.id,
    wallet: walletPublic(ensureWallet(userId)),
    hostWallet: walletPublic(hostWallet),
  });
});

/** Active users (for mass text) */
app.get('/api/users/active', (_req, res) => {
  res.json({ users: listActiveUsers(), count: listActiveUsers().length });
});

app.post('/api/users/active', (req, res) => {
  const userId = String(req.body?.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  touchActiveUser({
    userId,
    userName: String(req.body?.userName || 'User'),
    avatarUrl: req.body?.avatarUrl ? String(req.body.avatarUrl) : undefined,
    role: req.body?.role === 'host' ? 'host' : 'user',
  });
  res.json({ ok: true, users: listActiveUsers() });
});

/** Recharge board: every userId + coins, updated on each recharge */
app.get('/api/recharges', (_req, res) => {
  res.json({
    users: [...rechargeByUser.values()].sort((a, b) => b.lastAt - a.lastAt),
    events: recentRecharges.slice(0, 50),
  });
});

/** Host mass-texts ONLY real-time active Luma users (role=user) */
app.post('/api/host/mass-text', (req, res) => {
  const hostId = String(req.body?.hostId || '').trim();
  const hostName = String(req.body?.hostName || 'Host').slice(0, 40);
  const text = String(req.body?.text || '').trim().slice(0, 500);
  if (!hostId || !text) {
    res.status(400).json({ error: 'hostId and text required' });
    return;
  }

  const recentDuplicate = massTextHistory.find(
    (row) =>
      row.hostId === hostId &&
      row.text === text &&
      Date.now() - row.at < 5_000,
  );
  if (recentDuplicate) {
    res.json({
      ok: true,
      deduplicated: true,
      sent: recentDuplicate.toCount,
      broadcast: recentDuplicate,
      userIds: recentDuplicate.userIds,
      recipients: [],
    });
    return;
  }

  // Only users seen in the last 2 minutes count as "online" for mass text
  const targets = listActiveUsers(2 * 60_000)
    .filter((u) => u.role === 'user' && u.userId !== hostId)
    .map((u) => ({
      userId: u.userId,
      userName: u.userName,
    }));

  if (targets.length === 0) {
    res.status(409).json({
      error: 'No active users online right now',
      sent: 0,
      userIds: [],
      recipients: [],
    });
    return;
  }

  const payload = {
    id: randomUUID().slice(0, 10),
    hostId,
    hostName,
    text,
    toCount: targets.length,
    userIds: targets.map((u) => u.userId),
    broadcast: false,
    activeOnly: true,
    at: Date.now(),
  };
  massTextHistory.unshift(payload);
  if (massTextHistory.length > 50) massTextHistory.length = 50;

  broadcastWs({ type: 'mass:text', payload });
  for (const u of targets) {
    pushToHost(u.userId, 'mass_text', payload);
  }
  pushToHost(hostId, 'mass_text_sent', {
    ...payload,
    title: 'Mass texting sent',
    body: `Sent to ${targets.length} active users`,
  });
  persist();

  res.json({
    ok: true,
    sent: targets.length,
    broadcast: payload,
    userIds: payload.userIds,
    recipients: targets.slice(0, 40),
  });
});

app.get('/api/host/mass-text/history', (req, res) => {
  const hostId = String(req.query.hostId || '').trim();
  const list = hostId
    ? massTextHistory.filter((m) => m.hostId === hostId)
    : massTextHistory;
  res.json({ items: list.slice(0, 30) });
});

/** Fan inbox — mass texts addressed to this user (or broadcast to all) */
app.get('/api/users/inbox', (req, res) => {
  const userId = String(req.query.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  const items = massTextHistory
    .filter((m) => !m.userIds?.length || m.userIds.includes(userId))
    .slice(0, 40)
    .map((m) => ({
      id: m.id,
      hostId: m.hostId,
      hostName: m.hostName,
      text: m.text,
      at: m.at,
      kind: 'mass_text' as const,
    }));
  res.json({ items });
});

/** Audience token for watching a host live stream (Agora live mode) */
app.get('/api/live/token', (req, res) => {
  try {
    const hostId = String(req.query.hostId || '').trim();
    const channelParam = String(req.query.channel || '').trim();
    const channel = channelParam || (hostId ? `live_${hostId}` : '');
    const userId = String(req.query.userId || req.headers['x-user-id'] || '').trim();
    if (!channel) {
      res.status(400).json({ error: 'hostId or channel required' });
      return;
    }
    const adminOk = isAdminCredential(
      req.query.key || req.headers['x-admin-key'],
    );
    if (
      !adminOk &&
      !channel.startsWith('live_') &&
      !channel.startsWith('party_') &&
      !channel.startsWith('call_')
    ) {
      res.status(403).json({ error: 'Channel not allowed' });
      return;
    }

    // Coin-locked live: require paid entry before issuing Agora token
    if (!adminOk && channel.startsWith('live_') && userId) {
      const found = findLiveRoom(hostId || channel);
      if (found?.room?.isLive) {
        const access = hasLiveEntryAccess(found.room, userId);
        if (!access.allowed && access.entryFee > 0) {
          res.status(402).json({
            error: 'Payment required to enter live',
            entryFee: access.entryFee,
            entryLocked: true,
            roomId: found.id,
          });
          return;
        }
      }
    }

    const uid = Number(req.query.uid || Math.floor(100000 + Math.random() * 800000));
    // Publisher privilege so RTC subscribe works even if project role checks are strict
    res.json(mintToken(channel, uid, 'publisher'));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Token error' });
  }
});

/** Host creates admin support ticket */
app.post('/api/support/tickets', (req, res) => {
  const hostId = String(req.body?.hostId || '').trim();
  const hostName = String(req.body?.hostName || 'Host').slice(0, 40);
  const text = String(req.body?.text || '').trim().slice(0, 1000);
  const imageUrl = req.body?.imageUrl
    ? String(req.body.imageUrl).slice(0, 2000)
    : undefined;
  if (!hostId || !text) {
    res.status(400).json({ error: 'hostId and text required' });
    return;
  }
  const now = Date.now();
  const firstMsg: SupportMessage = {
    id: `msg_${randomUUID().slice(0, 8)}`,
    from: 'host',
    text,
    imageUrl,
    createdAt: now,
  };
  const ticket: SupportTicket = {
    id: `sup_${randomUUID().slice(0, 8)}`,
    hostId,
    hostName,
    text,
    imageUrl,
    status: 'open',
    messages: [firstMsg],
    createdAt: now,
    updatedAt: now,
  };
  supportTickets.unshift(ticket);
  broadcastWs({ type: 'support:ticket', payload: ticket });
  res.status(201).json({ ok: true, ticket });
});

app.get('/api/support/tickets', (req, res) => {
  const hostId = String(req.query.hostId || '').trim();
  const list = hostId
    ? supportTickets.filter((t) => t.hostId === hostId)
    : supportTickets;
  // Backfill messages for older persisted tickets
  const normalized = list.slice(0, 100).map((t) => ({
    ...t,
    messages:
      Array.isArray(t.messages) && t.messages.length
        ? t.messages
        : [
            {
              id: `msg_${t.id}`,
              from: 'host' as const,
              text: t.text,
              imageUrl: t.imageUrl,
              createdAt: t.createdAt,
            },
          ],
  }));
  res.json({ tickets: normalized });
});

app.get('/api/support/tickets/:id', (req, res) => {
  const id = String(req.params.id || '');
  const hostId = String(req.query.hostId || '').trim();
  const ticket = supportTickets.find((t) => t.id === id);
  if (!ticket || (hostId && ticket.hostId !== hostId)) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }
  if (!Array.isArray(ticket.messages) || !ticket.messages.length) {
    ticket.messages = [
      {
        id: `msg_${ticket.id}`,
        from: 'host',
        text: ticket.text,
        imageUrl: ticket.imageUrl,
        createdAt: ticket.createdAt,
      },
    ];
  }
  res.json({ ok: true, ticket });
});

/** Host or admin posts a reply on a ticket */
app.post('/api/support/tickets/:id/messages', (req, res) => {
  const id = String(req.params.id || '');
  const ticket = supportTickets.find((t) => t.id === id);
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }
  const fromRaw = String(req.body?.from || 'host').toLowerCase();
  const from: 'host' | 'admin' = fromRaw === 'admin' ? 'admin' : 'host';
  const hostId = String(req.body?.hostId || '').trim();
  if (from === 'host' && hostId && ticket.hostId !== hostId) {
    res.status(403).json({ error: 'Not your ticket' });
    return;
  }
  const text = String(req.body?.text || '').trim().slice(0, 1000);
  const imageUrl = req.body?.imageUrl
    ? String(req.body.imageUrl).slice(0, 2000)
    : undefined;
  if (!text && !imageUrl) {
    res.status(400).json({ error: 'text or imageUrl required' });
    return;
  }
  if (!Array.isArray(ticket.messages)) ticket.messages = [];
  const msg: SupportMessage = {
    id: `msg_${randomUUID().slice(0, 8)}`,
    from,
    text: text || (imageUrl ? '📷 Screenshot' : ''),
    imageUrl,
    createdAt: Date.now(),
  };
  ticket.messages.push(msg);
  ticket.updatedAt = Date.now();
  if (from === 'admin') ticket.status = 'answered';
  else if (ticket.status === 'closed') ticket.status = 'open';
  broadcastWs({ type: 'support:ticket', payload: ticket });
  res.status(201).json({ ok: true, ticket, message: msg });
});

app.get('/api/admin/support/tickets', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ tickets: supportTickets.slice(0, 200) });
});

app.post('/api/admin/support/tickets/:id/status', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = String(req.params.id || '');
  const ticket = supportTickets.find((t) => t.id === id);
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }
  const status = String(req.body?.status || '').toLowerCase();
  if (!['open', 'answered', 'closed'].includes(status)) {
    res.status(400).json({ error: 'status must be open|answered|closed' });
    return;
  }
  ticket.status = status as SupportTicket['status'];
  ticket.updatedAt = Date.now();
  broadcastWs({ type: 'support:ticket', payload: ticket });
  res.json({ ok: true, ticket });
});

app.post('/api/admin/support/tickets/:id/reply', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = String(req.params.id || '');
  const ticket = supportTickets.find((t) => t.id === id);
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }
  const text = String(req.body?.text || '').trim().slice(0, 1000);
  const imageUrl = req.body?.imageUrl
    ? String(req.body.imageUrl).slice(0, 2000)
    : undefined;
  if (!text && !imageUrl) {
    res.status(400).json({ error: 'text or imageUrl required' });
    return;
  }
  if (!Array.isArray(ticket.messages)) ticket.messages = [];
  const msg: SupportMessage = {
    id: `msg_${randomUUID().slice(0, 8)}`,
    from: 'admin',
    text: text || (imageUrl ? '📷 Screenshot' : ''),
    imageUrl,
    createdAt: Date.now(),
  };
  ticket.messages.push(msg);
  ticket.status = 'answered';
  ticket.updatedAt = Date.now();
  broadcastWs({ type: 'support:ticket', payload: ticket });
  res.status(201).json({ ok: true, ticket, message: msg });
});

/** -------- Direct messages (Luma user ↔ Host) -------- */
app.post('/api/dm/send', (req, res) => {
  const fromId = String(req.body?.fromId || '').trim();
  const toId = String(req.body?.toId || '').trim();
  const text = String(req.body?.text || '').trim().slice(0, 500);
  const imageUrl = req.body?.imageUrl
    ? String(req.body.imageUrl).slice(0, 2000)
    : undefined;
  const fromName = String(req.body?.fromName || 'User').trim().slice(0, 40) || 'User';
  const fromAvatar = req.body?.fromAvatar ? String(req.body.fromAvatar).slice(0, 500) : undefined;
  const fromRole = String(req.body?.fromRole || 'user') === 'host' ? 'host' : 'user';
  const peerName = String(req.body?.peerName || '').trim().slice(0, 40);
  const peerAvatar = req.body?.peerAvatar ? String(req.body.peerAvatar).slice(0, 500) : undefined;
  const clientMessageId = String(req.body?.clientMessageId || '').trim().slice(0, 80);

  if (!fromId || !toId || (!text && !imageUrl)) {
    res.status(400).json({ error: 'fromId, toId, text or imageUrl required' });
    return;
  }

  const { chatId, msg } = pushDmMessage({
    fromId,
    toId,
    fromName,
    fromAvatar,
    text: text || (imageUrl ? '📷 Photo' : ''),
    imageUrl,
    kind: imageUrl ? 'image' : 'text',
    clientMessageId,
  });

  const userId = fromRole === 'user' ? fromId : toId;
  const hostId = fromRole === 'host' ? fromId : toId;
  const userName = fromRole === 'user' ? fromName : peerName || 'Fan';
  const hostName = fromRole === 'host' ? fromName : peerName || 'Host';
  const userAvatar = fromRole === 'user' ? fromAvatar : peerAvatar;
  const hostAvatar = fromRole === 'host' ? fromAvatar : peerAvatar;

  const thread = upsertDmThread({
    userId,
    userName,
    userAvatar,
    hostId,
    hostName,
    hostAvatar,
    lastMessage: text,
    at: msg.createdAt,
  });

  const payload = { chatId, message: msg, thread };
  broadcastWs({ type: 'dm:message', payload });
  pushToHost(hostId, 'dm_message', payload);
  persist();
  res.status(201).json({ ok: true, ...payload });
});

/** Convert a local chat photo into a durable public URL before sending the DM. */
app.post('/api/chat/images', (req, res) => {
  const ownerId = String(req.body?.ownerId || req.headers['x-user-id'] || '').trim();
  const image = String(req.body?.image || req.body?.dataUrl || '');
  if (!ownerId || !image) {
    res.status(400).json({ error: 'ownerId and image required' });
    return;
  }
  const imageId = `chat_${createHash('sha256')
    .update(`${ownerId}:${Date.now()}:${image.length}`)
    .digest('hex')
    .slice(0, 24)}`;
  const saved = saveHostAvatar(imageId, image);
  if (!saved.ok || !saved.url) {
    res.status(400).json({ error: saved.error || 'Image upload failed' });
    return;
  }
  persist();
  res.status(201).json({ ok: true, imageUrl: saved.url });
});

app.get('/api/dm/threads', (req, res) => {
  const userId = String(req.query.userId || '').trim();
  const hostId = String(req.query.hostId || '').trim();
  let threads = [...dmThreads.values()];
  if (userId) threads = threads.filter((t) => t.userId === userId);
  if (hostId) threads = threads.filter((t) => t.hostId === hostId);
  threads.sort((a, b) => b.updatedAt - a.updatedAt);
  res.json({ threads });
});

app.get('/api/dm/messages', (req, res) => {
  const a = String(req.query.a || req.query.userId || '').trim();
  const b = String(req.query.b || req.query.hostId || '').trim();
  if (!a || !b) {
    res.status(400).json({ error: 'a and b (userId/hostId) required' });
    return;
  }
  const chatId = dmChatId(a, b);
  const viewerId = String(req.query.viewerId || req.headers['x-user-id'] || '').trim();
  const list = (dmMessages.get(chatId) || []).map((m) => {
    if (viewerId && m.toId === viewerId && !m.readAt) {
      m.readAt = Date.now();
    }
    return m;
  });
  if (viewerId) dmMessages.set(chatId, list);
  res.json({
    chatId,
    messages: list,
  });
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (socket, req) => {
  wsClients.add(socket);
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const userId = url.searchParams.get('userId') || 'anon';
  const userName = url.searchParams.get('name') || 'User';
  const avatarUrl = url.searchParams.get('avatar') || undefined;
  const role = url.searchParams.get('role') === 'host' ? 'host' : 'user';
  touchActiveUser({ userId, userName, avatarUrl: avatarUrl || undefined, role });
  if (userId && userId !== 'anon') {
    let set = wsByUser.get(userId);
    if (!set) {
      set = new Set();
      wsByUser.set(userId, set);
    }
    set.add(socket);
  }
  socket.send(JSON.stringify({ type: 'connected', payload: { userId } }));

  socket.on('close', () => {
    wsClients.delete(socket);
    const set = wsByUser.get(userId);
    if (set) {
      set.delete(socket);
      if (!set.size) wsByUser.delete(userId);
    }
  });

  socket.on('message', (buf) => {
    try {
      const raw = JSON.parse(String(buf)) as {
        type: string;
        roomId?: string;
        userId?: string;
        text?: string;
        fromUserId?: string;
        giftId?: string;
        coins?: number;
        label?: string;
        toHostId?: string;
        payload?: Record<string, unknown>;
      };
      const payload = (raw.payload || {}) as Record<string, unknown>;
      const type = raw.type;
      const roomId = String(raw.roomId || payload.roomId || '');
      const text = String(raw.text || payload.text || '');
      const coins = Number(raw.coins ?? payload.coins ?? 0);
      const hostId = String(raw.userId || payload.hostId || payload.userId || userId);

      if (type === 'host:hello' || type === 'user:hello' || type === 'hello') {
        touchActiveUser({
          userId: hostId,
          userName: String(payload.name || payload.userName || userName),
          avatarUrl: String(payload.avatarUrl || avatarUrl || '') || undefined,
          role: type === 'host:hello' ? 'host' : 'user',
        });
        socket.send(JSON.stringify({ type: 'host:welcome', payload: { hostId } }));
        return;
      }

      if (type === 'party:message' && roomId && text) {
        broadcastWs({
          type: 'party:message',
          payload: {
            roomId,
            userId: hostId,
            text,
            at: Date.now(),
          },
        });
      }

      // Legacy clients used to mirror a completed HTTP gift as `gift:send`.
      // Never turn that unauthoritative signal into a second received gift:
      // /api/gifts/send owns charging, crediting and the single broadcast.

      if (type === 'dm:send') {
        const fromId = String(
          payload.fromId || (raw as { fromId?: string }).fromId || raw.fromUserId || userId,
        );
        const toId = String(
          payload.toId || (raw as { toId?: string }).toId || raw.toHostId || '',
        );
        const dmText = String(payload.text || text || '').trim().slice(0, 500);
        if (fromId && toId && dmText) {
          const fromRole = String(payload.fromRole || (raw as { fromRole?: string }).fromRole || 'user') === 'host' ? 'host' : 'user';
          const fromName = String(
            payload.fromName || (raw as { fromName?: string }).fromName || userName || 'User',
          ).slice(0, 40);
          const { chatId, msg } = pushDmMessage({
            fromId,
            toId,
            fromName,
            text: dmText,
            kind: 'text',
          });
          const uId = fromRole === 'user' ? fromId : toId;
          const hId = fromRole === 'host' ? fromId : toId;
          const thread = upsertDmThread({
            userId: uId,
            userName: fromRole === 'user' ? fromName : String(payload.peerName || 'Fan'),
            hostId: hId,
            hostName: fromRole === 'host' ? fromName : String(payload.peerName || 'Host'),
            lastMessage: dmText,
            at: msg.createdAt,
          });
          const dmPayload = { chatId, message: msg, thread };
          broadcastWs({ type: 'dm:message', payload: dmPayload });
          pushToHost(hId, 'dm_message', dmPayload);
          persist();
        }
      }

      if (type === 'gift:request') {
        broadcastWs({
          type: 'gift:request',
          payload: {
            ...payload,
            at: Date.now(),
          },
        });
      }

      if (type === 'gift:respond') {
        broadcastWs({
          type: String(payload.status) === 'accepted' ? 'gift:accepted' : 'gift:declined',
          payload: {
            ...payload,
            at: Date.now(),
          },
        });
      }

      if (type === 'party:join' && roomId) {
        broadcastWs({
          type: 'party:seat',
          payload: { roomId, seats: [], userId: hostId },
        });
      }
    } catch {
      /* ignore */
    }
  });
});

/** Static help-center articles for Host app (admin-managed copy) */
registerPaymentRoutes(app, {
  authenticate: (req) => authenticateUserToken(bearerToken(req.headers.authorization)),
  requireAdmin,
  walletBalance: (userId) => ensureWallet(userId).coinBalance,
  syncEntitlement: (userId, balance, vip) => {
    const wallet = ensureWallet(userId);
    wallet.coinBalance = Math.max(0, Math.floor(balance));
    if (typeof vip === 'boolean') wallet.isPremium = vip;
    wallets.set(userId, wallet);
    persist();
    broadcastWallet(userId);
  },
});

const HELP_CENTER_ARTICLES = [
  {
    id: 'go-online',
    title: 'Go online for 1:1 calls',
    category: 'Getting started',
    body: 'Open Home → toggle Available for 1:1 ON. Keep the app open so fans can reach you. Android may pause background apps — disable battery optimization for CoinCall Host.',
  },
  {
    id: 'go-live',
    title: 'Start a live stream',
    category: 'Live',
    body: 'Tap Go Live, set your title, then Start. Use Lock Live to add gift-gated photos. Fans unlock them with gifts.',
  },
  {
    id: 'gifts',
    title: 'Gifting & earnings',
    category: 'Gifts',
    body: 'During a call or live, gifts transfer coins from the fan wallet to your host wallet (minus platform commission). Check Earnings for history.',
  },
  {
    id: 'mass-text',
    title: 'Message online users',
    category: 'Chat',
    body: 'Messages tab shows Active fans. Tap a fan to DM, or use Mass Texting to reach everyone currently online.',
  },
  {
    id: 'withdraw',
    title: 'Withdraw earnings',
    category: 'Wallet',
    body: 'Home → Withdraw. Submit payout details and wait for Finance approval. Check notifications for status updates.',
  },
  {
    id: 'contact-support',
    title: 'Contact admin support',
    category: 'Support',
    body: 'Open Help / Support and create a ticket. You get a reply notification when admin answers.',
  },
];

app.get('/api/help-center', (_req, res) => {
  res.json({ ok: true, articles: HELP_CENTER_ARTICLES });
});

app.get('/api/admin/help-center', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ ok: true, articles: HELP_CENTER_ARTICLES });
});

app.get('/terms', (_req, res) => {
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"/><title>Terms</title>
  <style>body{font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.55;color:#111}
  h1{font-size:28px} p{color:#333}</style></head><body>
  <h1>CoinCall Terms of Service</h1>
  <p>By using CoinCall Host you agree to follow community guidelines, respect fans, and comply with applicable laws. Live streams and calls must not include illegal content. CoinCall may suspend accounts that violate these terms. Earnings and withdrawals are subject to platform review and fees.</p>
  <p>Contact support from the Host Help Center for account issues.</p>
  </body></html>`);
});

app.get('/privacy', (_req, res) => {
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"/><title>Privacy</title>
  <style>body{font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.55;color:#111}
  h1{font-size:28px} p{color:#333}</style></head><body>
  <h1>CoinCall Privacy Policy</h1>
  <p>We collect account profile data, device information, call/live metadata, and wallet activity needed to operate Host features. Media you upload (profile photos, intro video, live camera) is processed to deliver the service. Support tickets and screenshots are visible to administrators.</p>
  <p>We do not sell personal data. Contact admin support to request account data review.</p>
  </body></html>`);
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`CoinCall API listening on http://0.0.0.0:${PORT}`);
  console.log(`WS:     ws://0.0.0.0:${PORT}/ws`);
  console.log(`Health: GET /api/health`);
  console.log(`Wallet: POST /api/wallet/me  POST /api/wallet/spend  POST /api/wallet/iap/verify`);
  console.log(`Payout: POST /api/host/withdrawals`);
  console.log(`Hosts:  GET /api/hosts`);
  console.log(`Calls:  POST /api/calls`);
  console.log(`Help:   GET /api/help-center`);
  console.log(`AutoCall: scheduler every 1s`);
  console.log(`Persist: ${persistenceLabel()}`);
});

setInterval(() => {
  try {
    runAutoCallSchedulerTick();
  } catch (e) {
    console.warn('[auto-call] tick failed', e);
  }
}, 1_000);

void applyMongoOrDisk().catch((e) => {
  console.warn('[persist] mongo boot skipped', e);
});

function flushPersist() {
  try {
    saveNow(buildSnapshot);
  } catch {
    /* ignore */
  }
  void closeMongo();
}

process.on('SIGTERM', () => {
  flushPersist();
  process.exit(0);
});
process.on('SIGINT', () => {
  flushPersist();
  process.exit(0);
});
