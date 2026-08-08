import { createCipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import type { ClientSession, Collection, Db } from 'mongodb';
import { requireMongoClient, requireMongoDb } from './mongoStore.ts';
import { PAYMENT_PRODUCTS, type PaymentProduct } from './paymentCatalog.ts';

export type PaymentProvider = 'google_play' | 'stripe';
export type PaymentStatus =
  | 'CREATED' | 'PENDING' | 'PROCESSING' | 'VERIFIED' | 'COMPLETED'
  | 'FAILED' | 'CANCELLED' | 'REFUNDED' | 'REVOKED';

type PaymentTransaction = {
  id: string; userId: string; provider: PaymentProvider; providerTransactionId: string;
  providerEventId?: string; productId: string; productType: 'coins' | 'vip';
  purchaseTokenHash?: string; purchaseTokenEncrypted?: string; orderId?: string;
  amount?: number; currency?: string; status: PaymentStatus; coinsGranted: number;
  subscriptionId?: string; verifiedAt?: Date; completedAt?: Date; refundedAt?: Date;
  purchaseTime?: Date; verificationStatus?: string; acknowledgementStatus?: string;
  subscriptionExpiry?: Date; purchaseTokenReference?: string;
  createdAt: Date; updatedAt: Date; metadata?: Record<string, unknown>;
};

const names = {
  products: 'payment_products', transactions: 'payment_transactions',
  attempts: 'payment_attempts', wallets: 'wallet_accounts', ledger: 'wallet_ledger',
  subscriptions: 'user_subscriptions', webhooks: 'processed_webhook_events',
  refunds: 'refunds', audits: 'payment_audit_logs',
} as const;

function collection<T extends object = Record<string, any>>(db: Db, name: string): Collection<T> {
  return db.collection<T>(name);
}

export function hashProviderToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function encryptToken(value: string): string {
  const secret = String(process.env.PAYMENT_DATA_ENCRYPTION_KEY || '');
  if (!secret) throw new Error('PAYMENT_DATA_ENCRYPTION_KEY is not configured');
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((v) => v.toString('base64url')).join('.');
}

export async function ensurePaymentIndexes(): Promise<void> {
  const db = requireMongoDb();
  await Promise.all([
    collection(db, names.transactions).createIndex(
      { provider: 1, providerTransactionId: 1 }, { unique: true },
    ),
    collection(db, names.transactions).createIndex(
      { purchaseTokenHash: 1 }, { unique: true, sparse: true },
    ),
    collection(db, names.transactions).createIndex({ userId: 1, createdAt: -1 }),
    collection(db, names.ledger).createIndex({ idempotencyKey: 1 }, { unique: true }),
    collection(db, names.ledger).createIndex({ userId: 1, createdAt: -1 }),
    collection(db, names.webhooks).createIndex({ provider: 1, eventId: 1 }, { unique: true }),
    collection(db, names.subscriptions).createIndex(
      { provider: 1, providerSubscriptionId: 1 }, { unique: true, sparse: true },
    ),
  ]);
  const now = new Date();
  for (const product of PAYMENT_PRODUCTS) {
    await collection(db, names.products).updateOne({ id: product.id }, {
      $set: { ...product, updatedAt: now }, $setOnInsert: { createdAt: now },
    }, { upsert: true });
  }
}

export async function recordPaymentAttempt(input: {
  userId: string; provider: PaymentProvider; productId: string; status: PaymentStatus;
  failureCode?: string; metadata?: Record<string, unknown>;
}) {
  const now = new Date();
  await collection(requireMongoDb(), names.attempts).insertOne({
    id: randomUUID(), ...input, createdAt: now, updatedAt: now,
  });
}

export async function claimWebhook(provider: PaymentProvider, eventId: string): Promise<boolean> {
  try {
    await collection(requireMongoDb(), names.webhooks).insertOne({
      provider, eventId, status: 'PROCESSING', createdAt: new Date(),
    });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const reclaimed = await collection(requireMongoDb(), names.webhooks).findOneAndUpdate(
        { provider, eventId, status: 'FAILED' },
        { $set: { status: 'PROCESSING', updatedAt: new Date() } },
        { returnDocument: 'after' },
      );
      return Boolean(reclaimed);
    }
    throw error;
  }
}

export async function finishWebhook(provider: PaymentProvider, eventId: string, error?: unknown) {
  await collection(requireMongoDb(), names.webhooks).updateOne(
    { provider, eventId },
    { $set: {
      status: error ? 'FAILED' : 'COMPLETED',
      errorCode: error instanceof Error ? error.message.slice(0, 160) : undefined,
      updatedAt: new Date(),
    } },
  );
}

export async function completePayment(input: {
  userId: string; provider: PaymentProvider; providerTransactionId: string;
  providerEventId?: string; purchaseToken?: string; orderId?: string;
  product: PaymentProduct; amount?: number; currency?: string;
  subscriptionId?: string; subscriptionExpiresAt?: Date; seedBalance: number;
  purchaseTime?: Date; acknowledgementStatus?: string;
  metadata?: Record<string, unknown>;
}): Promise<PaymentTransaction & { walletBalance: number; duplicate: boolean }> {
  const db = requireMongoDb();
  const client = requireMongoClient();
  const tokenHash = input.purchaseToken ? hashProviderToken(input.purchaseToken) : undefined;
  const existing = await collection<PaymentTransaction>(db, names.transactions).findOne({
    $or: [
      { provider: input.provider, providerTransactionId: input.providerTransactionId },
      ...(tokenHash ? [{ purchaseTokenHash: tokenHash }] : []),
    ],
  });
  if (existing) {
    if (existing.userId !== input.userId || existing.productId !== input.product.id) {
      throw new Error('PAYMENT_ALREADY_CLAIMED');
    }
    const wallet = await collection(db, names.wallets).findOne({ userId: input.userId });
    return { ...existing, walletBalance: Number(wallet?.balance || 0), duplicate: true };
  }

  const session = client.startSession();
  try {
    let result!: PaymentTransaction & { walletBalance: number; duplicate: boolean };
    await session.withTransaction(async () => {
      const now = new Date();
      const coinsGranted = input.product.type === 'coins'
        ? input.product.coins + input.product.bonusCoins
        : input.product.bonusCoins;
      const wallets = collection(db, names.wallets);
      await wallets.updateOne(
        { userId: input.userId },
        { $setOnInsert: { userId: input.userId, balance: Math.max(0, input.seedBalance), debt: 0,
          frozen: false, createdAt: now }, $set: { updatedAt: now } },
        { upsert: true, session },
      );
      if (coinsGranted > 0) {
        await wallets.updateOne({ userId: input.userId }, { $inc: { balance: coinsGranted }, $set: { updatedAt: now } }, { session });
        await collection(db, names.ledger).insertOne({
          id: randomUUID(), userId: input.userId, type: 'PURCHASE_CREDIT', amount: coinsGranted,
          provider: input.provider, productId: input.product.id,
          idempotencyKey: `payment:${input.provider}:${input.providerTransactionId}`,
          createdAt: now,
        }, { session });
      }
      if (input.product.type === 'vip') {
        const expiry = input.subscriptionExpiresAt || new Date(now.getTime() + (input.product.vipDays || 0) * 86_400_000);
        await collection(db, names.subscriptions).updateOne(
          { provider: input.provider, providerSubscriptionId: input.subscriptionId || input.providerTransactionId },
          { $set: { userId: input.userId, productId: input.product.id, status: 'ACTIVE',
            startsAt: now, expiresAt: expiry, updatedAt: now },
            $setOnInsert: { id: randomUUID(), provider: input.provider,
              providerSubscriptionId: input.subscriptionId || input.providerTransactionId, createdAt: now } },
          { upsert: true, session },
        );
      }
      const wallet = await wallets.findOne({ userId: input.userId }, { session });
      const transaction: PaymentTransaction = {
        id: randomUUID(), userId: input.userId, provider: input.provider,
        providerTransactionId: input.providerTransactionId, providerEventId: input.providerEventId,
        productId: input.product.id, productType: input.product.type,
        purchaseTokenHash: tokenHash,
        purchaseTokenEncrypted: input.purchaseToken ? encryptToken(input.purchaseToken) : undefined,
        purchaseTokenReference: tokenHash ? `${tokenHash.slice(0, 12)}…${tokenHash.slice(-8)}` : undefined,
        orderId: input.orderId, amount: input.amount, currency: input.currency,
        status: 'COMPLETED', coinsGranted, subscriptionId: input.subscriptionId,
        purchaseTime: input.purchaseTime, verificationStatus: 'VERIFIED',
        acknowledgementStatus: input.acknowledgementStatus,
        subscriptionExpiry: input.subscriptionExpiresAt,
        verifiedAt: now, completedAt: now, createdAt: now, updatedAt: now, metadata: input.metadata,
      };
      await collection<PaymentTransaction>(db, names.transactions).insertOne(transaction, { session });
      await collection(db, names.audits).insertOne({ id: randomUUID(), action: 'PAYMENT_COMPLETED',
        paymentId: transaction.id, userId: input.userId, provider: input.provider, createdAt: now }, { session });
      result = { ...transaction, walletBalance: Number(wallet?.balance || 0), duplicate: false };
    });
    return result;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return completePayment(input);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function updateGoogleSettlement(input: {
  paymentId: string; acknowledgementStatus: string; error?: string;
}) {
  await collection(requireMongoDb(), names.transactions).updateOne(
    { id: input.paymentId, provider: 'google_play' },
    { $set: {
      acknowledgementStatus: input.acknowledgementStatus,
      settlementError: input.error?.slice(0, 160),
      updatedAt: new Date(),
    } },
  );
}

export async function paymentHistory(userId: string, page: number, limit: number) {
  const db = requireMongoDb();
  const safeLimit = Math.min(100, Math.max(1, limit));
  const filter = { userId };
  const [items, total] = await Promise.all([
    collection<PaymentTransaction>(db, names.transactions).find(filter, {
      projection: { purchaseTokenEncrypted: 0, purchaseTokenHash: 0 },
    }).sort({ createdAt: -1 }).skip((page - 1) * safeLimit).limit(safeLimit).toArray(),
    collection(db, names.transactions).countDocuments(filter),
  ]);
  return { items, page, limit: safeLimit, total };
}

export async function currentSubscription(userId: string) {
  return collection(requireMongoDb(), names.subscriptions).findOne(
    { userId, status: { $in: ['ACTIVE', 'IN_GRACE_PERIOD', 'CANCELLED_PENDING_EXPIRY'] },
      expiresAt: { $gt: new Date() } },
    { sort: { expiresAt: -1 } },
  );
}

export async function getPaymentForUser(id: string, userId: string) {
  return collection<PaymentTransaction>(requireMongoDb(), names.transactions).findOne(
    { id, userId }, { projection: { purchaseTokenEncrypted: 0, purchaseTokenHash: 0 } },
  );
}

export async function getProviderPaymentForUser(providerTransactionId: string, userId: string) {
  return collection<PaymentTransaction>(requireMongoDb(), names.transactions).findOne(
    { providerTransactionId, userId }, { projection: { purchaseTokenEncrypted: 0, purchaseTokenHash: 0 } },
  );
}

export async function findGooglePaymentByToken(purchaseToken: string) {
  return collection<PaymentTransaction>(requireMongoDb(), names.transactions).findOne(
    { provider: 'google_play', purchaseTokenHash: hashProviderToken(purchaseToken) },
    { projection: { purchaseTokenEncrypted: 0 } },
  );
}

export async function updateSubscriptionState(input: {
  providerSubscriptionId: string; status: string; expiresAt?: Date;
  provider?: PaymentProvider;
}) {
  const update: Record<string, unknown> = { status: input.status, updatedAt: new Date() };
  if (input.expiresAt) update.expiresAt = input.expiresAt;
  await collection(requireMongoDb(), names.subscriptions).updateOne(
    { provider: input.provider || 'google_play', providerSubscriptionId: input.providerSubscriptionId },
    { $set: update },
  );
}

export async function revokeSubscriptionEntitlement(input: {
  providerSubscriptionId: string; status: string; eventId: string;
}) {
  const now = new Date();
  const db = requireMongoDb();
  await collection(db, names.subscriptions).updateOne(
    { provider: 'google_play', providerSubscriptionId: input.providerSubscriptionId },
    { $set: { status: input.status, updatedAt: now } },
  );
  await collection(db, names.audits).insertOne({
    id: randomUUID(), action: 'SUBSCRIPTION_ENTITLEMENT_CHANGED',
    providerSubscriptionId: input.providerSubscriptionId, status: input.status,
    eventId: input.eventId, createdAt: now,
  });
}

export async function reversePayment(input: {
  provider: PaymentProvider; providerTransactionId: string; eventId: string;
  reason: string; revoke?: boolean;
}) {
  const db = requireMongoDb();
  const client = requireMongoClient();
  const session = client.startSession();
  try {
    let result: Record<string, unknown> | null = null;
    await session.withTransaction(async () => {
      const tx = await collection<PaymentTransaction>(db, names.transactions).findOne(
        { provider: input.provider, $or: [
          { providerTransactionId: input.providerTransactionId },
          { 'metadata.paymentIntentId': input.providerTransactionId },
          { subscriptionId: input.providerTransactionId },
        ] }, { session },
      );
      if (!tx) throw new Error('PAYMENT_NOT_FOUND');
      if (tx.status === 'REFUNDED' || tx.status === 'REVOKED') { result = tx; return; }
      const now = new Date();
      const wallet = await collection(db, names.wallets).findOne({ userId: tx.userId }, { session });
      const balance = Number(wallet?.balance || 0);
      const debit = Math.min(balance, tx.coinsGranted);
      const debt = Math.max(0, tx.coinsGranted - debit);
      if (tx.coinsGranted > 0) {
        await collection(db, names.wallets).updateOne({ userId: tx.userId }, {
          $inc: { balance: -debit, debt },
          $set: { frozen: debt > 0, reviewReason: debt > 0 ? 'REFUND_AFTER_SPEND' : null, updatedAt: now },
        }, { session });
        await collection(db, names.ledger).insertOne({
          id: randomUUID(), userId: tx.userId, type: 'PAYMENT_REVERSAL', amount: -debit,
          debtCreated: debt, paymentId: tx.id, idempotencyKey: `refund:${input.provider}:${input.eventId}`,
          reason: input.reason, createdAt: now,
        }, { session });
      }
      if (tx.productType === 'vip') {
        await collection(db, names.subscriptions).updateMany({ userId: tx.userId, productId: tx.productId },
          { $set: { status: input.revoke ? 'REVOKED' : 'CANCELLED', updatedAt: now } }, { session });
      }
      const status = input.revoke ? 'REVOKED' : 'REFUNDED';
      await collection(db, names.transactions).updateOne({ id: tx.id },
        { $set: { status, refundedAt: now, updatedAt: now } }, { session });
      await collection(db, names.refunds).insertOne({ id: randomUUID(), paymentId: tx.id,
        userId: tx.userId, provider: input.provider, eventId: input.eventId, reason: input.reason,
        coinsDebited: debit, debtCreated: debt, status, createdAt: now }, { session });
      result = { ...tx, status, refundedAt: now };
    });
    return result;
  } finally { await session.endSession(); }
}

export async function listAdminPayments(query: { page: number; limit: number; provider?: string; status?: string; search?: string }) {
  const db = requireMongoDb();
  const filter: Record<string, unknown> = {};
  if (query.provider) filter.provider = query.provider;
  if (query.status) filter.status = query.status;
  if (query.search) filter.$or = ['id', 'userId', 'providerTransactionId', 'orderId', 'productId']
    .map((key) => ({ [key]: { $regex: query.search, $options: 'i' } }));
  const limit = Math.min(100, Math.max(1, query.limit));
  const items = await collection<PaymentTransaction>(db, names.transactions).find(filter, {
    projection: { purchaseTokenEncrypted: 0, purchaseTokenHash: 0 },
  }).sort({ createdAt: -1 }).skip((query.page - 1) * limit).limit(limit).toArray();
  return { items, page: query.page, limit, total: await collection(db, names.transactions).countDocuments(filter) };
}
