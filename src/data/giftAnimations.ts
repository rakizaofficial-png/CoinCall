import { GIFT_CATALOG } from './gifts';

export type GiftLottieDetails = {
  source: string;
  durationMs: number;
  soundUrl?: string;
};

const DEFAULT_COIN_LOTTIE =
  'https://assets10.lottiefiles.com/packages/lf20_q5pk6p1k.json';

const GIFT_LOTTIE_SOURCES: Record<string, string> = {
  coin: DEFAULT_COIN_LOTTIE,
  single_rose: 'https://assets4.lottiefiles.com/packages/lf20_obhph3sh.json',
  heart_tap: 'https://assets1.lottiefiles.com/packages/lf20_zw0djhar.json',
  applause: DEFAULT_COIN_LOTTIE,
  rose_bouquet: 'https://assets4.lottiefiles.com/packages/lf20_obhph3sh.json',
  neon_heart: 'https://assets1.lottiefiles.com/packages/lf20_zw0djhar.json',
  golden_butterfly: 'https://assets8.lottiefiles.com/packages/lf20_bhw1ul4g.json',
  diamond_ring: 'https://assets10.lottiefiles.com/packages/lf20_q5pk6p1k.json',
  fireworks: 'https://assets2.lottiefiles.com/packages/lf20_u4yrau.json',
  sports_car: 'https://assets7.lottiefiles.com/packages/lf20_touohxv0.json',
  super_bike: 'https://assets10.lottiefiles.com/packages/lf20_q5pk6p1k.json',
  diamond_crown: 'https://assets6.lottiefiles.com/packages/lf20_zrqthn6o.json',
  red_carpet: 'https://assets2.lottiefiles.com/packages/lf20_u4yrau.json',
};

export function resolveGiftLottie(giftId: string): GiftLottieDetails {
  const gift = GIFT_CATALOG.find((item) => item.id === giftId);
  return {
    source: gift?.animationUrl || GIFT_LOTTIE_SOURCES[giftId] || DEFAULT_COIN_LOTTIE,
    durationMs: gift?.animMs ? Math.max(2400, gift.animMs) : 5200,
    soundUrl: gift?.soundUrl,
  };
}
