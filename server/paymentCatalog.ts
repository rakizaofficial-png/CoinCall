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
};

const coin = (amount: number, bonusCoins = 0): PaymentProduct => ({
  id: `luma_coins_${amount}`,
  type: 'coins',
  title: `${amount + bonusCoins} Coins`,
  coins: amount,
  bonusCoins,
  googleProductId: `luma_coins_${amount}`,
  googleProductType: 'inapp',
  stripePriceEnv: `STRIPE_PRICE_LUMA_COINS_${amount}`,
  active: true,
});

/** Entitlements live here; provider dashboards remain authoritative for price. */
export const PAYMENT_PRODUCTS: readonly PaymentProduct[] = [
  coin(50),
  coin(100),
  coin(250, 10),
  coin(500, 50),
  coin(1000, 120),
  coin(2000, 350),
  coin(5000, 1000),
  coin(10000, 2500),
  {
    id: 'luma_vip_week', type: 'vip', title: 'VIP Weekly', coins: 0,
    bonusCoins: 100, vipDays: 7, googleProductId: 'luma_vip_week',
    googleProductType: 'subs', stripePriceEnv: 'STRIPE_PRICE_LUMA_VIP_WEEK', active: true,
  },
  {
    id: 'luma_vip_month', type: 'vip', title: 'VIP Monthly', coins: 0,
    bonusCoins: 500, vipDays: 30, googleProductId: 'luma_vip_month',
    googleProductType: 'subs', stripePriceEnv: 'STRIPE_PRICE_LUMA_VIP_MONTH', active: true,
  },
  {
    id: 'luma_vip_year', type: 'vip', title: 'VIP Yearly', coins: 0,
    bonusCoins: 7500, vipDays: 365, googleProductId: 'luma_vip_year',
    googleProductType: 'subs', stripePriceEnv: 'STRIPE_PRICE_LUMA_VIP_YEAR', active: true,
  },
];

export function getPaymentProduct(id: string): PaymentProduct | undefined {
  return PAYMENT_PRODUCTS.find((product) => product.active && product.id === id);
}

export function publicPaymentCatalog(platform: 'google' | 'web') {
  return PAYMENT_PRODUCTS.filter((product) => product.active).map((product) => ({
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
