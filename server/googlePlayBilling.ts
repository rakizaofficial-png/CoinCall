import { GoogleAuth } from 'google-auth-library';

const ANDROID_PUBLISHER_SCOPE =
  'https://www.googleapis.com/auth/androidpublisher';

type GooglePlayProductPurchase = {
  purchaseState?: number;
  consumptionState?: number;
  acknowledgementState?: number;
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
  return {
    orderId: String(purchase.orderId || ''),
    alreadyConsumed: purchase.consumptionState === 1,
    acknowledgementState: Number(purchase.acknowledgementState || 0),
    obfuscatedExternalAccountId: purchase.obfuscatedExternalAccountId,
    regionCode: purchase.regionCode,
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
