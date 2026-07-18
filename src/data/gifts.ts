export type GiftItem = {
  id: string;
  name: string;
  emoji: string;
  coins: number;
  tier: 'basic' | 'luxury' | 'combo' | 'legendary';
  effect: 'float' | 'burst' | 'full' | 'combo';
  /** If true, sending this gift can unlock locked live photos */
  unlocksPhotos?: boolean;
};

export const GIFT_CATALOG: GiftItem[] = [
  { id: 'rose', name: 'Rose', emoji: '🌹', coins: 1, tier: 'basic', effect: 'float' },
  { id: 'heart', name: 'Heart', emoji: '💖', coins: 5, tier: 'basic', effect: 'float' },
  { id: 'kiss', name: 'Kiss', emoji: '💋', coins: 10, tier: 'basic', effect: 'burst' },
  { id: 'star', name: 'Star', emoji: '⭐', coins: 20, tier: 'basic', effect: 'burst' },
  {
    id: 'diamond',
    name: 'Diamond',
    emoji: '💎',
    coins: 99,
    tier: 'luxury',
    effect: 'full',
    unlocksPhotos: true,
  },
  {
    id: 'crown',
    name: 'Crown',
    emoji: '👑',
    coins: 199,
    tier: 'luxury',
    effect: 'full',
    unlocksPhotos: true,
  },
  {
    id: 'sports',
    name: 'Sports Car',
    emoji: '🏎️',
    coins: 520,
    tier: 'combo',
    effect: 'combo',
    unlocksPhotos: true,
  },
  {
    id: 'yacht',
    name: 'Yacht',
    emoji: '🛥️',
    coins: 999,
    tier: 'combo',
    effect: 'combo',
    unlocksPhotos: true,
  },
  {
    id: 'castle',
    name: 'Castle',
    emoji: '🏰',
    coins: 1999,
    tier: 'legendary',
    effect: 'full',
    unlocksPhotos: true,
  },
  {
    id: 'rocket',
    name: 'Rocket',
    emoji: '🚀',
    coins: 2999,
    tier: 'legendary',
    effect: 'full',
    unlocksPhotos: true,
  },
];

/** Min coins on a gift that unlocks locked photos */
export const PHOTO_UNLOCK_MIN_COINS = 99;

export const LIVE_CATEGORIES = [
  'Beauty',
  'Singing',
  'Dance',
  'Chat',
  'Game',
  'Fashion',
  'Lifestyle',
] as const;

export const LIVE_LANGUAGES = [
  'English',
  'Arabic',
  'Urdu',
  'Hindi',
  'Turkish',
  'French',
] as const;
