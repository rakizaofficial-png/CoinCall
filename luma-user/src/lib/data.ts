export type Creator = {
  id: string;
  name: string;
  country: string;
  flag: string;
  age: number;
  bio: string;
  tags: string[];
  online: boolean;
  live: boolean;
  viewers: number;
  callRate: number;
  rating: number;
  image: string;
  gradient: string;
};

export type LiveRoom = {
  id: string;
  title: string;
  creatorId: string;
  viewers: number;
  hot: boolean;
  category: string;
};

export type ChatThread = {
  id: string;
  creatorId: string;
  lastMessage: string;
  time: string;
  unread: number;
  preview: string;
};

export type Gift = {
  id: string;
  name: string;
  emoji: string;
  coins: number;
};

export type CoinPack = {
  id: string;
  coins: number;
  price: string;
  bonus?: number;
  popular?: boolean;
  best?: boolean;
  tag?: string;
};

export type DailyTask = {
  id: string;
  title: string;
  reward: number;
  done: boolean;
  icon: string;
};

export const creators: Creator[] = [
  {
    id: "c1",
    name: "Mira",
    country: "Korea",
    flag: "🇰🇷",
    age: 23,
    bio: "Night owl · coffee chats · soft playlists",
    tags: ["Music", "Chill"],
    online: true,
    live: true,
    viewers: 1842,
    callRate: 80,
    rating: 4.9,
    image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&h=800&fit=crop",
    gradient: "from-rose-500/40 to-orange-400/20",
  },
  {
    id: "c2",
    name: "Sofia",
    country: "Brazil",
    flag: "🇧🇷",
    age: 25,
    bio: "Dance breaks & late-night stories",
    tags: ["Dance", "Fun"],
    online: true,
    live: true,
    viewers: 3201,
    callRate: 95,
    rating: 4.8,
    image: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&h=800&fit=crop",
    gradient: "from-amber-500/40 to-rose-400/20",
  },
  {
    id: "c3",
    name: "Aya",
    country: "Japan",
    flag: "🇯🇵",
    age: 22,
    bio: "Quiet vibes · language exchange",
    tags: ["Talk", "Calm"],
    online: true,
    live: false,
    viewers: 0,
    callRate: 70,
    rating: 4.7,
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&h=800&fit=crop",
    gradient: "from-teal-500/40 to-cyan-400/20",
  },
  {
    id: "c4",
    name: "Lina",
    country: "Turkey",
    flag: "🇹🇷",
    age: 24,
    bio: "Warm laughs & midnight energy",
    tags: ["Party", "Live"],
    online: true,
    live: true,
    viewers: 956,
    callRate: 85,
    rating: 4.9,
    image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&h=800&fit=crop",
    gradient: "from-orange-500/40 to-yellow-400/20",
  },
  {
    id: "c5",
    name: "Noor",
    country: "UAE",
    flag: "🇦🇪",
    age: 26,
    bio: "Stories, style, soft voice notes",
    tags: ["Style", "Chat"],
    online: false,
    live: false,
    viewers: 0,
    callRate: 90,
    rating: 4.6,
    image: "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=600&h=800&fit=crop",
    gradient: "from-fuchsia-500/30 to-amber-400/20",
  },
  {
    id: "c6",
    name: "Elena",
    country: "Spain",
    flag: "🇪🇸",
    age: 27,
    bio: "Guitar loops · sunset moods",
    tags: ["Music", "Live"],
    online: true,
    live: true,
    viewers: 2104,
    callRate: 100,
    rating: 5.0,
    image: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=600&h=800&fit=crop",
    gradient: "from-red-500/40 to-amber-300/20",
  },
];

export const liveRooms: LiveRoom[] = [
  { id: "l1", title: "Midnight karaoke 🎤", creatorId: "c1", viewers: 1842, hot: true, category: "Music" },
  { id: "l2", title: "Dance battle warm-up", creatorId: "c2", viewers: 3201, hot: true, category: "Party" },
  { id: "l3", title: "Soft talk & tea", creatorId: "c4", viewers: 956, hot: false, category: "Chat" },
  { id: "l4", title: "Sunset guitar set", creatorId: "c6", viewers: 2104, hot: true, category: "Music" },
];

export const threads: ChatThread[] = [
  {
    id: "m1",
    creatorId: "c1",
    lastMessage: "Hey! Catch me live later? ✨",
    time: "2m",
    unread: 2,
    preview: "Hey! Catch me live later? ✨",
  },
  {
    id: "m2",
    creatorId: "c2",
    lastMessage: "That call was so fun 🔥",
    time: "18m",
    unread: 0,
    preview: "That call was so fun 🔥",
  },
  {
    id: "m3",
    creatorId: "c3",
    lastMessage: "Want to practice Japanese tomorrow?",
    time: "1h",
    unread: 1,
    preview: "Want to practice Japanese tomorrow?",
  },
  {
    id: "m4",
    creatorId: "c6",
    lastMessage: "Sending you a song request 🎵",
    time: "Yesterday",
    unread: 0,
    preview: "Sending you a song request 🎵",
  },
];

export const gifts: Gift[] = [
  { id: "g1", name: "Rose", emoji: "🌹", coins: 5 },
  { id: "g2", name: "Kiss", emoji: "💋", coins: 50 },
  { id: "g3", name: "Star", emoji: "⭐", coins: 120 },
  { id: "g4", name: "Royal Crown", emoji: "👑", coins: 500 },
  { id: "g5", name: "Magic Castle", emoji: "🏰", coins: 1200 },
  { id: "g6", name: "Diamond", emoji: "💎", coins: 3000 },
];

export const giftTickerLines = [
  "User492 just gifted a Magic Castle to Aisha!",
  "VIP_Kai sent a Royal Crown 👑",
  "Mira received 12 Roses in 30 seconds",
  "Sofia unlocked a Diamond gift 💎",
  "Blind Match revealed — call went crystal clear",
];

export const coinPacks: CoinPack[] = [
  { id: "p1", coins: 100, price: "$0.99", tag: "Starter" },
  { id: "p2", coins: 500, price: "$4.99", bonus: 50 },
  { id: "p3", coins: 1200, price: "$9.99", bonus: 200, popular: true, tag: "Most loved" },
  { id: "p4", coins: 2500, price: "$19.99", bonus: 500 },
  { id: "p5", coins: 6500, price: "$49.99", bonus: 1500, best: true, tag: "Best value" },
  { id: "p6", coins: 15000, price: "$99.99", bonus: 4500, tag: "Whale" },
];

export const dailyTasks: DailyTask[] = [
  { id: "t1", title: "Open Luma today", reward: 20, done: true, icon: "☀️" },
  { id: "t2", title: "Watch a live for 2 min", reward: 40, done: false, icon: "📺" },
  { id: "t3", title: "Send a gift", reward: 60, done: false, icon: "🎁" },
  { id: "t4", title: "Start a 1v1 call", reward: 80, done: false, icon: "📹" },
];

export const engagingLines = [
  "Someone’s online and waiting for you.",
  "One tap. Instant chemistry.",
  "Your next favorite live starts now.",
  "Coins unlock the moment — make it count.",
  "Say hey — the best chats start mid-sentence.",
  "Gift a Rose. Start a story.",
  "VIP fans talk longer for less.",
];

export function getCreator(id: string) {
  return creators.find((c) => c.id === id)!;
}
