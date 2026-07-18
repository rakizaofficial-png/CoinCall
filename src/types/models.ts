export type UserRole = 'user' | 'host' | 'admin';

/** Host application gate — main app only when approved */
export type HostStatus =
  | 'none'
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'banned';

export interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: UserRole;
  coinBalance: number;
  diamonds: number;
  gems: number;
  level: number;
  isVerified: boolean;
  avatarUrl: string;
  isOnline: boolean;
  /** Public host ID shown after apply (e.g. H28491) */
  hostId?: string;
  hostStatus: HostStatus;
  country?: string;
  /** Main / first photo */
  photoUrl?: string;
  /** All submitted beauty photos */
  photoUrls?: string[];
  videoUrl?: string;
  applicationSubmittedAt?: number;
  rejectionReason?: string;
  docsRequested?: string;
  bio?: string;
  languages?: string[];
  categories?: string[];
  callPrice?: number;
  idDocumentUrl?: string;
  selfieUrl?: string;
  banned?: boolean;
  suspended?: boolean;
  callsEnabled?: boolean;
  videoCallsEnabled?: boolean;
  voiceCallsEnabled?: boolean;
  giftsEnabled?: boolean;
  withdrawalsAllowed?: boolean;
  walletFrozen?: boolean;
}

export interface Host {
  id: string;
  name: string;
  avatarUrl: string;
  country: string;
  level: number;
  isVip: boolean;
  isOnline: boolean;
  isLive: boolean;
  /** Currently in a 1:1 call */
  isOnCall: boolean;
  ratePerMinute: number;
  rating: number;
  bio: string;
  photos: string[];
  totalCalls: number;
  /** Call minutes earned today (competition) */
  todayMinutes: number;
  /** Longest single call today in seconds */
  longestCallSeconds: number;
  todayCoins: number;
  /** Seconds into current call if on call */
  currentCallSeconds: number;
}

export interface CoinPackage {
  id: string;
  coins: number;
  priceLabel: string;
  bonus?: number;
  popular?: boolean;
}

export interface Transaction {
  id: string;
  type: 'purchase' | 'spend' | 'earn' | 'payout';
  amount: number;
  label: string;
  timestamp: number;
}

export interface NewsItem {
  id: string;
  category: 'flame' | 'prime' | 'stranger';
  title: string;
  subtitle: string;
  icon: 'mail' | 'bell' | 'headset';
  unread: number;
  timestamp: string;
}

export interface PartyRoom {
  id: string;
  hostId?: string;
  title: string;
  description: string;
  avatarUrl: string;
  language: string;
  viewers: number;
  gems: number;
  rank: number;
  isLive: boolean;
}


export interface CallSession {
  hostId: string;
  startedAt: number;
  seconds: number;
  coinsSpent: number;
  status: 'active' | 'ended';
}
