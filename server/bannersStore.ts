/**
 * Luma home hero + swipe promo banners (admin-editable).
 */

export type HomeHeroBanner = {
  enabled: boolean;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  gradientFrom: string;
  gradientTo: string;
};

export type PromoSlide = {
  id: string;
  enabled: boolean;
  title: string;
  subtitle: string;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  bgFrom: string;
  bgTo: string;
};

export type HomeBannersConfig = {
  hero: HomeHeroBanner;
  promos: PromoSlide[];
  updatedAt: number;
};

export function defaultHomeBanners(): HomeBannersConfig {
  return {
    updatedAt: Date.now(),
    hero: {
      enabled: true,
      title: 'Meet more friends',
      subtitle: 'Live video & 1v1 calls',
      ctaLabel: 'Tap to Match',
      ctaHref: '/match',
      gradientFrom: '#ffb020',
      gradientTo: '#ff6b2b',
    },
    promos: [
      {
        id: 'promo_coins',
        enabled: true,
        title: 'Coin boost',
        subtitle: 'Top up and get extra coins this week',
        imageUrl: '',
        ctaLabel: 'Wallet',
        ctaHref: '/profile',
        bgFrom: '#2a1a12',
        bgTo: '#5c3a1a',
      },
      {
        id: 'promo_vip',
        enabled: true,
        title: 'Go VIP',
        subtitle: 'Discounted calls · priority match',
        imageUrl: '',
        ctaLabel: 'VIP',
        ctaHref: '/premium',
        bgFrom: '#1a1528',
        bgTo: '#3d2a5c',
      },
      {
        id: 'promo_live',
        enabled: true,
        title: 'Watch live',
        subtitle: 'Hosts are streaming now',
        imageUrl: '',
        ctaLabel: 'Live',
        ctaHref: '/live',
        bgFrom: '#121820',
        bgTo: '#1a3040',
      },
    ],
  };
}

let homeBanners: HomeBannersConfig = defaultHomeBanners();

export function getHomeBanners(): HomeBannersConfig {
  return homeBanners;
}

export function setHomeBanners(next: Partial<HomeBannersConfig> | HomeBannersConfig) {
  const base = defaultHomeBanners();
  const hero = {
    ...base.hero,
    ...(homeBanners.hero || {}),
    ...((next as HomeBannersConfig).hero || {}),
  };
  const promosRaw = Array.isArray((next as HomeBannersConfig).promos)
    ? (next as HomeBannersConfig).promos
    : homeBanners.promos;
  const promos = promosRaw
    .map((p, i) => ({
      id: String(p.id || `promo_${i + 1}`),
      enabled: p.enabled !== false,
      title: String(p.title || '').trim() || 'Promo',
      subtitle: String(p.subtitle || '').trim(),
      imageUrl: String(p.imageUrl || '').trim(),
      ctaLabel: String(p.ctaLabel || 'Open').trim(),
      ctaHref: String(p.ctaHref || '/').trim() || '/',
      bgFrom: String(p.bgFrom || '#1a1520'),
      bgTo: String(p.bgTo || '#2a2030'),
    }))
    .slice(0, 12);

  homeBanners = {
    hero: {
      enabled: hero.enabled !== false,
      title: String(hero.title || '').trim() || 'Meet more friends',
      subtitle: String(hero.subtitle || '').trim(),
      ctaLabel: String(hero.ctaLabel || 'Tap to Match').trim(),
      ctaHref: String(hero.ctaHref || '/match').trim() || '/match',
      gradientFrom: String(hero.gradientFrom || '#ffb020'),
      gradientTo: String(hero.gradientTo || '#ff6b2b'),
    },
    promos,
    updatedAt: Date.now(),
  };
  return homeBanners;
}

export function loadHomeBannersFromSnapshot(raw: unknown) {
  if (!raw || typeof raw !== 'object') return;
  try {
    setHomeBanners(raw as HomeBannersConfig);
  } catch {
    /* keep defaults */
  }
}

export function dumpHomeBannersForSnapshot(): HomeBannersConfig {
  return homeBanners;
}
