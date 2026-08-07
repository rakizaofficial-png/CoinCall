import Stripe from 'stripe';
import type { PaymentProduct } from './paymentCatalog.ts';

let stripeClient: Stripe | null = null;
function stripe(): Stripe {
  const key = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  stripeClient ||= new Stripe(key);
  return stripeClient;
}

export async function createStripeCheckout(input: {
  userId: string; email?: string; product: PaymentProduct;
}) {
  const price = String(process.env[input.product.stripePriceEnv] || '').trim();
  if (!price) throw new Error(`${input.product.stripePriceEnv} is not configured`);
  const publicUrl = String(process.env.PAYMENT_PUBLIC_WEB_URL || '').replace(/\/$/, '');
  if (!publicUrl.startsWith('https://') && process.env.NODE_ENV === 'production') {
    throw new Error('PAYMENT_PUBLIC_WEB_URL must use HTTPS');
  }
  const mode = input.product.type === 'vip' ? 'subscription' : 'payment';
  return stripe().checkout.sessions.create({
    mode,
    line_items: [{ price, quantity: 1 }],
    customer_email: input.email,
    client_reference_id: input.userId,
    metadata: { userId: input.userId, internalProductId: input.product.id, purchaseType: input.product.type },
    payment_intent_data: mode === 'payment'
      ? { metadata: { userId: input.userId, internalProductId: input.product.id } }
      : undefined,
    subscription_data: mode === 'subscription'
      ? { metadata: { userId: input.userId, internalProductId: input.product.id } }
      : undefined,
    success_url: `${publicUrl}/payment/result?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${publicUrl}/payment/result?status=cancelled`,
  }, { idempotencyKey: `checkout:${input.userId}:${input.product.id}:${Date.now() >> 12}` });
}

export function verifyStripeWebhook(rawBody: Buffer, signature: string) {
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  return stripe().webhooks.constructEvent(rawBody, signature, secret);
}
