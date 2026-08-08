export type PaymentProduct = {
  id: string;
  type: 'coins' | 'vip';
  title: string;
  coins: number;
  bonusCoins: number;
  vipDays?: number;
  googleProductId: string;
  googleProductType: 'inapp' | 'subs';
  stripePriceEnv: string;
  active: boolean;
  /** Only current products are returned to purchase UIs. Historical SKUs remain verifiable. */
  display: boolean;
};

const coin = (
  id: string,
  amount: number,
  options: { bonusCoins?: number; display?: boolean } = {},
): PaymentProduct => ({
  id,
  type: 'coins',
  title: `${amount + (options.bonusCoins || 0)} Coins`,
  coins: amount,
  bonusCoins: options.bonusCoins || 0,
  googleProductId: id,
  googleProductType: 'inapp',
  stripePriceEnv: `STRIPE_PRICE_${id.toUpperCase()}`,
  active: true,
  display: options.display ?? true,
});

/** Entitlements live here; provider dashboards remain authoritative for price. */
export const PAYMENT_PRODUCTS: readonly PaymentProduct[] = [
  // Google Play Console price configuration: $1, $5 and $10 respectively.
  // The client always renders the localized price returned by Google Play.
  coin('zuko_coins_90', 90),
  coin('zuko_coins_600', 600),
  coin('zuko_coins_1300', 1300),
  // Legacy SKUs remain valid for server verification/restoration, but are not
  // offered in new purchase UIs. Do not delete them while historical orders
  // can still be delivered or refunded.
  coin('luma_coins_50', 50, { display: false }),
  coin('luma_coins_100', 100, { display: false }),
  coin('luma_coins_250', 250, { bonusCoins: 10, display: false }),
  coin('luma_coins_500', 500, { bonusCoins: 50, display: false }),
  coin('luma_coins_1000', 1000, { bonusCoins: 120, display: false }),
  coin('luma_coins_2000', 2000, { bonusCoins: 350, display: false }),
  coin('luma_coins_5000', 5000, { bonusCoins: 1000, display: false }),
  coin('luma_coins_10000', 10000, { bonusCoins: 2500, display: false }),
  {
    id: 'luma_vip_week', type: 'vip', title: 'VIP Weekly', coins: 0,
    bonusCoins: 100, vipDays: 7, googleProductId: 'luma_vip_week',
    googleProductType: 'subs', stripePriceEnv: 'STRIPE_PRICE_LUMA_VIP_WEEK', active: true, display: true,
  },
  {
    id: 'luma_vip_month', type: 'vip', title: 'VIP Monthly', coins: 0,
    bonusCoins: 500, vipDays: 30, googleProductId: 'luma_vip_month',
    googleProductType: 'subs', stripePriceEnv: 'STRIPE_PRICE_LUMA_VIP_MONTH', active: true, display: true,
  },
  {
    id: 'luma_vip_year', type: 'vip', title: 'VIP Yearly', coins: 0,
    bonusCoins: 7500, vipDays: 365, googleProductId: 'luma_vip_year',
    googleProductType: 'subs', stripePriceEnv: 'STRIPE_PRICE_LUMA_VIP_YEAR', active: true, display: true,
  },
];

export function getPaymentProduct(id: string): PaymentProduct | undefined {
  return PAYMENT_PRODUCTS.find((product) => product.active && product.id === id);
}

export function publicPaymentCatalog(platform: 'google' | 'web') {
  return PAYMENT_PRODUCTS.filter((product) => product.active && product.display).map((product) => ({
    id: product.id,
    type: product.type,
    title: product.title,
    coins: product.coins,
    bonusCoins: product.bonusCoins,
    vipDays: product.vipDays,
    provider: platform === 'google' ? 'google_play' : 'stripe',
    providerProductId:
      platform === 'google' ? product.googleProductId : undefined,
    available:
      platform === 'google' || Boolean(process.env[product.stripePriceEnv]),
    // Google Play/Stripe clients render localized provider prices. No fake price.
    price: null,
  }));
}
