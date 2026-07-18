export type GiftItem = {
  id: string;
  name: string;
  emoji: string;
  coins: number;
  tier: 'basic' | 'luxury' | 'combo' | 'legendary';
  effect: 'float' | 'burst' | 'full' | 'combo';
};

export const GIFT_CATALOG: GiftItem[] = [
  { id: 'rose', name: 'Rose', emoji: '🌹', coins: 1, tier: 'basic', effect: 'float' },
  { id: 'heart', name: 'Heart', emoji: '💖', coins: 5, tier: 'basic', effect: 'float' },
  { id: 'kiss', name: 'Kiss', emoji: '💋', coins: 10, tier: 'basic', effect: 'burst' },
  { id: 'star', name: 'Star', emoji: '⭐', coins: 20, tier: 'basic', effect: 'burst' },
  { id: 'diamond', name: 'Diamond', emoji: '💎', coins: 99, tier: 'luxury', effect: 'full' },
  { id: 'crown', name: 'Crown', emoji: '👑', coins: 199, tier: 'luxury', effect: 'full' },
  { id: 'sports', name: 'Sports Car', emoji: '🏎️', coins: 520, tier: 'combo', effect: 'combo' },
  { id: 'yacht', name: 'Yacht', emoji: '🛥️', coins: 999, tier: 'combo', effect: 'combo' },
  { id: 'castle', name: 'Castle', emoji: '🏰', coins: 1999, tier: 'legendary', effect: 'full' },
  { id: 'rocket', name: 'Rocket', emoji: '🚀', coins: 2999, tier: 'legendary', effect: 'full' },
];

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
