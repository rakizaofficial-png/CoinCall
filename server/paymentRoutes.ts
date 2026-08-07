import type express from 'express';
import type Stripe from 'stripe';
import { createHash } from 'crypto';
import { getPaymentProduct, publicPaymentCatalog } from './paymentCatalog.ts';
import {
  acknowledgeGooglePlaySubscription, consumeGooglePlayProduct, getGooglePlaySubscriptionLifecycle,
  verifyGooglePlayProduct, verifyGooglePlaySubscription, verifyGooglePubSubIdentity,
} from './googlePlayBilling.ts';
import {
  claimWebhook, completePayment, currentSubscription, ensurePaymentIndexes, finishWebhook,
  findGooglePaymentByToken, getPaymentForUser, getProviderPaymentForUser, listAdminPayments,
  paymentHistory, recordPaymentAttempt, reversePayment, revokeSubscriptionEntitlement,
  updateGoogleSettlement, updateSubscriptionState,
} from './paymentStore.ts';
import { createStripeCheckout, verifyStripeWebhook } from './stripePayments.ts';
import type { UserAccount } from './userAuth.ts';

export type PaymentRequest = express.Request & { rawBody?: Buffer };

type Dependencies = {
  authenticate(req: express.Request): UserAccount | undefined;
  requireAdmin(req: express.Request, res: express.Response): boolean;
  walletBalance(userId: string): number;
  syncEntitlement(userId: string, balance: number, vip?: boolean): void;
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Payment processing failed';
}

function authenticated(req: express.Request, res: express.Response, deps: Dependencies) {
  const account = deps.authenticate(req);
  if (!account) res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Valid account session required' });
  return account;
}

export function registerPaymentRoutes(app: express.Express, deps: Dependencies) {
  app.get('/api/payments/catalog', (req, res) => {
    const platform = req.query.platform === 'google' ? 'google' : 'web';
    res.json({ ok: true, platform, products: publicPaymentCatalog(platform) });
  });

  app.post('/api/payments/google/verify', async (req, res) => {
    const account = authenticated(req, res, deps); if (!account) return;
    const productId = String(req.body?.productId || '');
    const purchaseToken = String(req.body?.purchaseToken || '');
    const packageName = String(process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.zuko.user');
    const product = getPaymentProduct(productId);
    if (!product || product.googleProductId !== productId || !purchaseToken) {
      res.status(400).json({ error: 'INVALID_PURCHASE_REQUEST' }); return;
    }
    try {
      await recordPaymentAttempt({ userId: account.userId, provider: 'google_play', productId, status: 'PROCESSING' });
      const verified = product.googleProductType === 'subs'
        ? await verifyGooglePlaySubscription({ packageName, productId, purchaseToken, userId: account.userId })
        : await verifyGooglePlayProduct({ packageName, productId, purchaseToken, userId: account.userId });
      const providerTransactionId = verified.orderId || createHash('sha256').update(purchaseToken).digest('hex');
      const transaction = await completePayment({
        userId: account.userId, provider: 'google_play', providerTransactionId,
        purchaseToken, orderId: verified.orderId, product, seedBalance: deps.walletBalance(account.userId),
        subscriptionId: product.type === 'vip' ? providerTransactionId : undefined,
        subscriptionExpiresAt: 'expiresAt' in verified ? verified.expiresAt : undefined,
        purchaseTime: 'purchasedAt' in verified ? verified.purchasedAt : undefined,
        acknowledgementStatus: String(verified.acknowledgementState),
        metadata: { packageName, regionCode: verified.regionCode },
      });
      // Settlement is retried even for duplicate verification calls. A transient
      // Google failure must not leave a securely credited purchase unconsumed.
      if (product.googleProductType === 'subs' &&
          verified.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') {
        await acknowledgeGooglePlaySubscription({ packageName, productId, purchaseToken });
        await updateGoogleSettlement({ paymentId: transaction.id, acknowledgementStatus: 'ACKNOWLEDGED' });
      } else if ('alreadyConsumed' in verified && !verified.alreadyConsumed) {
        await consumeGooglePlayProduct({ packageName, productId, purchaseToken });
        await updateGoogleSettlement({ paymentId: transaction.id, acknowledgementStatus: 'CONSUMED' });
      }
      deps.syncEntitlement(account.userId, transaction.walletBalance, product.type === 'vip' ? true : undefined);
      res.json({ ok: true, transaction });
    } catch (error) {
      await recordPaymentAttempt({ userId: account.userId, provider: 'google_play', productId,
        status: 'FAILED', failureCode: message(error).slice(0, 120) }).catch(() => undefined);
      res.status(message(error).includes('pending') ? 202 : 400).json({ error: 'GOOGLE_VERIFICATION_FAILED', message: message(error) });
    }
  });

  app.post('/api/payments/google/restore', async (req, res) => {
    const account = authenticated(req, res, deps); if (!account) return;
    const purchases = Array.isArray(req.body?.purchases) ? req.body.purchases.slice(0, 50) : [];
    const results = [];
    for (const purchase of purchases) {
      const product = getPaymentProduct(String(purchase?.productId || ''));
      if (!product || product.type !== 'vip') continue;
      try {
        const packageName = String(process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.zuko.user');
        const verified = await verifyGooglePlaySubscription({ packageName, productId: product.id,
          purchaseToken: String(purchase.purchaseToken || ''), userId: account.userId });
        results.push(await completePayment({ userId: account.userId, provider: 'google_play',
          providerTransactionId: verified.orderId || createHash('sha256').update(String(purchase.purchaseToken)).digest('hex'),
          purchaseToken: String(purchase.purchaseToken), orderId: verified.orderId, product,
          subscriptionId: verified.orderId, subscriptionExpiresAt: verified.expiresAt,
          seedBalance: deps.walletBalance(account.userId) }));
      } catch (error) { results.push({ productId: product.id, error: message(error) }); }
    }
    res.json({ ok: true, results });
  });

  app.post('/api/payments/stripe/checkout', async (req, res) => {
    const account = authenticated(req, res, deps); if (!account) return;
    const product = getPaymentProduct(String(req.body?.productId || ''));
    if (!product) { res.status(400).json({ error: 'PRODUCT_NOT_FOUND' }); return; }
    try {
      const session = await createStripeCheckout({ userId: account.userId, email: account.email, product });
      await recordPaymentAttempt({ userId: account.userId, provider: 'stripe', productId: product.id, status: 'CREATED',
        metadata: { checkoutSessionId: session.id } });
      res.status(201).json({ ok: true, paymentId: session.id, checkoutUrl: session.url });
    } catch (error) { res.status(503).json({ error: 'STRIPE_CHECKOUT_UNAVAILABLE', message: message(error) }); }
  });

  app.post('/api/payments/stripe/webhook', async (req: PaymentRequest, res) => {
    try {
      const signature = String(req.headers['stripe-signature'] || '');
      const event = verifyStripeWebhook(req.rawBody || Buffer.alloc(0), signature);
      if (!(await claimWebhook('stripe', event.id))) { res.json({ received: true, duplicate: true }); return; }
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = String(session.metadata?.userId || session.client_reference_id || '');
        const product = getPaymentProduct(String(session.metadata?.internalProductId || ''));
        if (!userId || !product || session.payment_status === 'unpaid') throw new Error('Invalid checkout entitlement metadata');
        const tx = await completePayment({ userId, provider: 'stripe', providerTransactionId: session.id,
          providerEventId: event.id, product, amount: session.amount_total || undefined,
          currency: session.currency || undefined, subscriptionId: typeof session.subscription === 'string' ? session.subscription : undefined,
          seedBalance: deps.walletBalance(userId), metadata: {
            paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
          } });
        deps.syncEntitlement(userId, tx.walletBalance, product.type === 'vip' ? true : undefined);
      } else if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : '';
        if (paymentIntentId) await reversePayment({ provider: 'stripe', providerTransactionId: paymentIntentId,
          eventId: event.id, reason: event.type, revoke: event.type.includes('dispute') });
      } else if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object as Stripe.Subscription;
        await reversePayment({ provider: 'stripe', providerTransactionId: subscription.id,
          eventId: event.id, reason: event.type, revoke: true });
      } else if (event.type === 'checkout.session.expired') {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.client_reference_id && session.metadata?.internalProductId) {
          await recordPaymentAttempt({ userId: session.client_reference_id, provider: 'stripe',
            productId: session.metadata.internalProductId, status: 'CANCELLED',
            metadata: { checkoutSessionId: session.id } });
        }
      }
      await finishWebhook('stripe', event.id);
      res.json({ received: true });
    } catch (error) {
      const eventId = String(req.body?.id || '');
      if (eventId) await finishWebhook('stripe', eventId, error).catch(() => undefined);
      res.status(400).json({ error: 'INVALID_STRIPE_WEBHOOK', message: message(error) });
    }
  });

  app.post('/api/payments/google/notifications', async (req, res) => {
    const expected = String(process.env.GOOGLE_PLAY_PUBSUB_VERIFICATION_TOKEN || '');
    if (!expected || String(req.query.token || '') !== expected) { res.status(401).json({ error: 'INVALID_NOTIFICATION_TOKEN' }); return; }
    try {
      await verifyGooglePubSubIdentity(String(req.headers.authorization || ''));
    } catch (error) {
      res.status(401).json({ error: 'INVALID_NOTIFICATION_IDENTITY', message: message(error) });
      return;
    }
    const eventId = String(req.body?.message?.messageId || '');
    if (!eventId) { res.status(400).json({ error: 'INVALID_NOTIFICATION' }); return; }
    const fresh = await claimWebhook('google_play', eventId);
    if (!fresh) { res.json({ ok: true, duplicate: true }); return; }
    try {
      const data = JSON.parse(Buffer.from(String(req.body?.message?.data || ''), 'base64').toString('utf8')) as {
        subscriptionNotification?: { notificationType?: number; purchaseToken?: string; subscriptionId?: string };
        oneTimeProductNotification?: { notificationType?: number; purchaseToken?: string; sku?: string };
      };
      const notice = data.subscriptionNotification || data.oneTimeProductNotification;
      const purchaseToken = String(notice?.purchaseToken || '');
      const payment = purchaseToken ? await findGooglePaymentByToken(purchaseToken) : null;
      if (!payment) {
        throw new Error('RTDN_PURCHASE_NOT_YET_KNOWN');
      }
      if (data.subscriptionNotification) {
        const type = Number(data.subscriptionNotification.notificationType || 0);
        if (type === 12) {
          await reversePayment({ provider: 'google_play', providerTransactionId: payment.providerTransactionId,
            eventId, reason: 'GOOGLE_SUBSCRIPTION_REVOKED', revoke: true });
          deps.syncEntitlement(payment.userId, deps.walletBalance(payment.userId), false);
        } else if (type === 13) {
          await revokeSubscriptionEntitlement({
            providerSubscriptionId: payment.subscriptionId || payment.providerTransactionId,
            status: 'EXPIRED', eventId,
          });
          deps.syncEntitlement(payment.userId, deps.walletBalance(payment.userId), false);
        } else if (type === 3) {
          await updateSubscriptionState({ providerSubscriptionId: payment.subscriptionId || payment.providerTransactionId,
            status: 'CANCELLED_PENDING_EXPIRY' });
        } else {
          const lifecycle = await getGooglePlaySubscriptionLifecycle({
            packageName: String(process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.zuko.user'),
            productId: payment.productId, purchaseToken, userId: payment.userId,
          });
          const statusByType: Record<number, string> = {
            1: 'ACTIVE', 2: 'ACTIVE', 4: 'ACTIVE', 5: 'ON_HOLD',
            6: 'IN_GRACE_PERIOD', 7: 'ACTIVE', 9: 'ACTIVE',
            10: 'PAUSED', 11: 'ACTIVE', 20: 'PENDING_PURCHASE_CANCELLED',
          };
          await updateSubscriptionState({ providerSubscriptionId: payment.subscriptionId || payment.providerTransactionId,
            status: statusByType[type] || lifecycle.state, expiresAt: lifecycle.expiresAt });
          deps.syncEntitlement(
            payment.userId,
            deps.walletBalance(payment.userId),
            ['ACTIVE', 'IN_GRACE_PERIOD'].includes(statusByType[type] || lifecycle.state),
          );
        }
      } else if (Number(data.oneTimeProductNotification?.notificationType) === 2) {
        await reversePayment({ provider: 'google_play', providerTransactionId: payment.providerTransactionId,
          eventId, reason: 'GOOGLE_ONE_TIME_PRODUCT_CANCELLED', revoke: true });
      }
      await finishWebhook('google_play', eventId);
      res.json({ ok: true });
    } catch (error) {
      await finishWebhook('google_play', eventId, error).catch(() => undefined);
      res.status(500).json({ error: 'RTDN_RECONCILIATION_FAILED', message: message(error) });
    }
  });

  app.get('/api/payments/history', async (req, res) => {
    const account = authenticated(req, res, deps); if (!account) return;
    try { res.json({ ok: true, ...(await paymentHistory(account.userId, Math.max(1, Number(req.query.page) || 1), Number(req.query.limit) || 20)) }); }
    catch (error) { res.status(503).json({ error: 'PAYMENTS_DATABASE_UNAVAILABLE', message: message(error) }); }
  });
  app.get('/api/payments/status', async (req, res) => {
    const account = authenticated(req, res, deps); if (!account) return;
    const providerTransactionId = String(req.query.providerTransactionId || '');
    if (!providerTransactionId) { res.status(400).json({ error: 'TRANSACTION_ID_REQUIRED' }); return; }
    const payment = await getProviderPaymentForUser(providerTransactionId, account.userId);
    res.json({ ok: true, payment, status: payment?.status || 'PROCESSING' });
  });
  app.get('/api/payments/:id', async (req, res) => {
    const account = authenticated(req, res, deps); if (!account) return;
    const payment = await getPaymentForUser(String(req.params.id), account.userId);
    if (!payment) { res.status(404).json({ error: 'PAYMENT_NOT_FOUND' }); return; }
    res.json({ ok: true, payment });
  });
  app.get('/api/subscriptions/me', async (req, res) => {
    const account = authenticated(req, res, deps); if (!account) return;
    res.json({ ok: true, subscription: await currentSubscription(account.userId) });
  });
  app.get('/api/admin/payments', async (req, res) => {
    if (!deps.requireAdmin(req, res)) return;
    res.json({ ok: true, ...(await listAdminPayments({ page: Math.max(1, Number(req.query.page) || 1),
      limit: Number(req.query.limit) || 25, provider: String(req.query.provider || ''),
      status: String(req.query.status || ''), search: String(req.query.search || '') })) });
  });

  ensurePaymentIndexes().catch((error) => console.warn('[payments] indexes pending:', message(error)));
}
