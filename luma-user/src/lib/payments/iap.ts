/**
 * =============================================================================
 * NATIVE IAP BRIDGE (Google Play Billing / Apple StoreKit)
 * =============================================================================
 *
 * WEB / NEXT.JS NOTE:
 * Browser builds cannot talk to Play Billing or StoreKit directly.
 * - In Expo / React Native shell: install `react-native-iap` or `expo-in-app-purchases`
 * - Call `purchaseProductNative()` from the native bridge
 * - Always finish with `verifyIapPurchase()` against CoinCall API
 *
 * WEB FALLBACK:
 * `purchaseProductWebCheckout()` opens your Play/App Store listing or a
 * server-hosted billing session URL returned by `/api/wallet/iap/session`.
 * =============================================================================
 */

import { requireApiBase } from "@/config/apiConfig";
import { getIapProduct } from "./iapCatalog";

export type IapPlatform = "google" | "apple" | "web";

export type VerifyIapResult = {
  ok: boolean;
  balance: number;
  credited: number;
  transactionId: string;
};

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const base = requireApiBase();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `IAP request failed (${res.status})`);
  }
  return data as T;
}

/**
 * Verify a native purchase token with the backend (authoritative credit).
 */
export async function verifyIapPurchase(input: {
  userId: string;
  productId: string;
  platform: IapPlatform;
  /** Google purchaseToken or Apple transaction receipt / JWS */
  purchaseToken: string;
}): Promise<VerifyIapResult> {
  const product = getIapProduct(input.productId);
  if (!product) throw new Error(`Unknown productId: ${input.productId}`);

  return apiJson<VerifyIapResult>("/wallet/iap/verify", {
    method: "POST",
    body: JSON.stringify({
      userId: input.userId,
      productId: input.productId,
      platform: input.platform,
      purchaseToken: input.purchaseToken,
      expectedCoins: product.coins + product.bonusCoins,
    }),
  });
}

/**
 * Ask backend for a hosted checkout / Play Billing deep-link session.
 * Use this on web until the native shell is ready.
 */
export async function createIapCheckoutSession(input: {
  userId: string;
  productId: string;
  platform?: IapPlatform;
}): Promise<{ checkoutUrl: string; sessionId: string }> {
  return apiJson("/wallet/iap/session", {
    method: "POST",
    body: JSON.stringify({
      userId: input.userId,
      productId: input.productId,
      platform: input.platform || "web",
    }),
  });
}

/**
 * Production entry: prefer native bridge when injected on window by RN WebView.
 * Falls back to server checkout session for browser.
 */
export async function purchaseCoins(input: {
  userId: string;
  productId: string;
}): Promise<VerifyIapResult | { redirected: true; checkoutUrl: string }> {
  const bridge = (
    window as unknown as {
      LumaNativeIap?: {
        purchase: (sku: string) => Promise<{
          platform: IapPlatform;
          purchaseToken: string;
        }>;
      };
    }
  ).LumaNativeIap;

  if (bridge?.purchase) {
    const product = getIapProduct(input.productId);
    if (!product) throw new Error("Unknown product");
    const native = await bridge.purchase(product.platformSku.google);
    return verifyIapPurchase({
      userId: input.userId,
      productId: input.productId,
      platform: native.platform,
      purchaseToken: native.purchaseToken,
    });
  }

  const session = await createIapCheckoutSession(input);
  window.location.href = session.checkoutUrl;
  return { redirected: true, checkoutUrl: session.checkoutUrl };
}
