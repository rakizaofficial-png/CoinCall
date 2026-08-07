import { GoogleAuth, OAuth2Client } from 'google-auth-library';

const ANDROID_PUBLISHER_SCOPE =
  'https://www.googleapis.com/auth/androidpublisher';

type GooglePlayProductPurchase = {
  purchaseState?: number;
  consumptionState?: number;
  acknowledgementState?: number;
  purchaseTimeMillis?: string;
  quantity?: number;
  orderId?: string;
  obfuscatedExternalAccountId?: string;
  regionCode?: string;
};

export type VerifiedGooglePlayPurchase = {
  orderId: string;
  alreadyConsumed: boolean;
  acknowledgementState: number;
  obfuscatedExternalAccountId?: string;
  regionCode?: string;
  purchasedAt?: Date;
  quantity: number;
};

type SubscriptionPurchaseV2 = {
  subscriptionState?: string;
  latestOrderId?: string;
  regionCode?: string;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: Array<{ productId?: string; expiryTime?: string; acknowledgementState?: string }>;
};

export type GoogleSubscriptionLifecycle = {
  state: string;
  orderId: string;
  acknowledgementState: string;
  expiresAt?: Date;
  regionCode?: string;
  owner?: string;
};

function serviceAccountCredentials() {
  const raw = String(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not configured');
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error('service account client_email/private_key missing');
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `Invalid GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: ${
        error instanceof Error ? error.message : 'invalid JSON'
      }`,
    );
  }
}

async function accessToken() {
  const auth = new GoogleAuth({
    credentials: serviceAccountCredentials(),
    scopes: [ANDROID_PUBLISHER_SCOPE],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('Google Play access token unavailable');
  return token.token;
}

function purchaseUrl(input: {
  packageName: string;
  productId: string;
  purchaseToken: string;
}) {
  const base = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
  return `${base}/applications/${encodeURIComponent(
    input.packageName,
  )}/purchases/products/${encodeURIComponent(
    input.productId,
  )}/tokens/${encodeURIComponent(input.purchaseToken)}`;
}

async function googleRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Google Play API ${response.status}${
        detail ? `: ${detail.slice(0, 500)}` : ''
      }`,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function verifyGooglePlayProduct(input: {
  packageName: string;
  productId: string;
  purchaseToken: string;
  userId: string;
}): Promise<VerifiedGooglePlayPurchase> {
  const purchase = await googleRequest<GooglePlayProductPurchase>(
    purchaseUrl(input),
  );
  // ProductPurchase purchaseState: 0 purchased, 1 cancelled, 2 pending.
  if (purchase.purchaseState !== 0) {
    const label =
      purchase.purchaseState === 2 ? 'pending' : 'cancelled/not purchased';
    throw new Error(`Google Play purchase is ${label}`);
  }
  if (
    purchase.obfuscatedExternalAccountId &&
    purchase.obfuscatedExternalAccountId !== input.userId
  ) {
    throw new Error('Google Play purchase belongs to another account');
  }
  const quantity = Number(purchase.quantity || 1);
  if (quantity !== 1) throw new Error('Unsupported Google Play purchase quantity');
  return {
    orderId: String(purchase.orderId || ''),
    alreadyConsumed: purchase.consumptionState === 1,
    acknowledgementState: Number(purchase.acknowledgementState || 0),
    obfuscatedExternalAccountId: purchase.obfuscatedExternalAccountId,
    regionCode: purchase.regionCode,
    purchasedAt: purchase.purchaseTimeMillis
      ? new Date(Number(purchase.purchaseTimeMillis))
      : undefined,
    quantity,
  };
}

export async function consumeGooglePlayProduct(input: {
  packageName: string;
  productId: string;
  purchaseToken: string;
}) {
  await googleRequest<void>(`${purchaseUrl(input)}:consume`, {
    method: 'POST',
    body: '{}',
  });
}

export async function getGooglePlaySubscriptionLifecycle(input: {
  packageName: string; productId: string; purchaseToken: string; userId: string;
}): Promise<GoogleSubscriptionLifecycle> {
  const base = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
  const url = `${base}/applications/${encodeURIComponent(input.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(input.purchaseToken)}`;
  const purchase = await googleRequest<SubscriptionPurchaseV2>(url);
  const owner = purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId;
  if (owner && owner !== input.userId) throw new Error('Google Play purchase belongs to another account');
  const line = purchase.lineItems?.find((item) => item.productId === input.productId);
  if (!line) throw new Error('Google Play subscription product mismatch');
  return {
    state: String(purchase.subscriptionState || 'SUBSCRIPTION_STATE_UNSPECIFIED'),
    orderId: String(purchase.latestOrderId || ''),
    acknowledgementState: String(line.acknowledgementState || ''),
    expiresAt: line.expiryTime ? new Date(line.expiryTime) : undefined,
    regionCode: purchase.regionCode,
    owner,
  };
}

export async function verifyGooglePlaySubscription(input: {
  packageName: string; productId: string; purchaseToken: string; userId: string;
}) {
  const purchase = await getGooglePlaySubscriptionLifecycle(input);
  const entitledStates = new Set([
    'SUBSCRIPTION_STATE_ACTIVE',
    'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  ]);
  if (!entitledStates.has(purchase.state)) {
    throw new Error(`Google Play subscription is ${purchase.state}`);
  }
  if (!purchase.expiresAt || purchase.expiresAt.getTime() <= Date.now()) {
    throw new Error('Google Play subscription is expired');
  }
  return purchase;
}

export async function acknowledgeGooglePlaySubscription(input: {
  packageName: string; productId: string; purchaseToken: string;
}) {
  const base = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
  const url = `${base}/applications/${encodeURIComponent(input.packageName)}/purchases/subscriptions/${encodeURIComponent(input.productId)}/tokens/${encodeURIComponent(input.purchaseToken)}:acknowledge`;
  await googleRequest<void>(url, { method: 'POST', body: '{}' });
}

export async function verifyGooglePubSubIdentity(authorization: string) {
  const audience = String(process.env.GOOGLE_PLAY_PUBSUB_AUDIENCE || '').trim();
  const expectedEmail = String(
    process.env.GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL || '',
  ).trim();
  if (!audience || !expectedEmail) {
    throw new Error('Google Play Pub/Sub OIDC verification is not configured');
  }
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Google Play Pub/Sub identity token missing');
  const ticket = await new OAuth2Client().verifyIdToken({ idToken: token, audience });
  const payload = ticket.getPayload();
  if (!payload?.email_verified || payload.email !== expectedEmail) {
    throw new Error('Google Play Pub/Sub identity rejected');
  }
}
