/**
 * =============================================================================
 * IN-APP PURCHASE CATALOG (Google Play / Apple)
 * =============================================================================
 *
 * SETUP:
 * 1. Play Console → Monetize with Play → In-app products
 *    Create managed products with EXACT productIds below.
 * 2. App Store Connect → Features → In-App Purchases
 *    Create consumable IAPs with the same productIds.
 * 3. After a successful native purchase, call `verifyIapPurchase()` so the
 *    CoinCall API credits the user wallet (never trust client-only grants).
 * =============================================================================
 */

export type IapProduct = {
  productId: string;
  platformSku: {
    google: string;
    apple: string;
  };
  coins: number;
  bonusCoins: number;
  priceLabel: string;
  title: string;
  popular?: boolean;
};

export const IAP_PRODUCTS: IapProduct[] = [
  {
    productId: "luma_coins_50",
    platformSku: { google: "luma_coins_50", apple: "luma_coins_50" },
    coins: 50,
    bonusCoins: 0,
    priceLabel: "$0.99",
    title: "Starter 50",
  },
  {
    productId: "luma_coins_500",
    platformSku: { google: "luma_coins_500", apple: "luma_coins_500" },
    coins: 500,
    bonusCoins: 50,
    priceLabel: "$4.99",
    title: "Boost 500",
  },
  {
    productId: "luma_coins_1200",
    platformSku: { google: "luma_coins_1200", apple: "luma_coins_1200" },
    coins: 1200,
    bonusCoins: 200,
    priceLabel: "$9.99",
    title: "Lounge 1200",
    popular: true,
  },
  {
    productId: "luma_coins_2500",
    platformSku: { google: "luma_coins_2500", apple: "luma_coins_2500" },
    coins: 2500,
    bonusCoins: 500,
    priceLabel: "$19.99",
    title: "Elite 2500",
  },
];

export function getIapProduct(productId: string) {
  return IAP_PRODUCTS.find((p) => p.productId === productId) ?? null;
}
