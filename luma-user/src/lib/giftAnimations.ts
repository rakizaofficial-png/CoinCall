const DEFAULT =
  "https://assets10.lottiefiles.com/packages/lf20_q5pk6p1k.json";

const SOURCES: Record<string, string> = {
  coin: DEFAULT,
  rose_bouquet: "https://assets4.lottiefiles.com/packages/lf20_obhph3sh.json",
  neon_heart: "https://assets1.lottiefiles.com/packages/lf20_zw0djhar.json",
  golden_butterfly: "https://assets8.lottiefiles.com/packages/lf20_bhw1ul4g.json",
  fireworks: "https://assets2.lottiefiles.com/packages/lf20_u4yrau.json",
  sports_car: "https://assets7.lottiefiles.com/packages/lf20_touohxv0.json",
  diamond_crown: "https://assets6.lottiefiles.com/packages/lf20_zrqthn6o.json",
};

export function giftAnimationSource(giftId: string) {
  return SOURCES[giftId] || DEFAULT;
}
