/** Welcome Push Call Engine — conversion funnel state machine */

export type WelcomePushPhase =
  | "IDLE"
  | "INCOMING_CALL"
  | "TEASER_PLAYING"
  | "PAYWALL_BOOST"
  | "DONE";

export type WelcomePushHost = {
  host_id: string;
  name: string;
  age: number;
  avatar: string;
  /** High-engagement teaser clip (cloud bucket or CDN) */
  teaser_video_url: string;
  country: string;
};

export type WelcomePaywallTier = {
  id: string;
  headline: string;
  sub: string;
  coins: number;
  price: string;
  neon: "green" | "pink" | "gold";
  popular?: boolean;
};

export const WELCOME_PUSH_HOST: WelcomePushHost = {
  host_id: "ai_aisha_welcome",
  name: "Aisha",
  age: 22,
  avatar: "https://i.pravatar.cc/800?u=aisha-luma-welcome-push",
  // Replace with: ${NEXT_PUBLIC_AI_HOST_CDN}/ai_aisha_welcome/teaser.mp4
  teaser_video_url:
    process.env.NEXT_PUBLIC_WELCOME_TEASER_URL ||
    (process.env.NEXT_PUBLIC_AI_HOST_CDN
      ? `${process.env.NEXT_PUBLIC_AI_HOST_CDN.replace(/\/$/, "")}/ai_aisha_welcome/teaser.mp4`
      : "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4"),
  country: "UAE",
};

export const WELCOME_PAYWALL_TIERS: WelcomePaywallTier[] = [
  {
    id: "unlock_5",
    headline: "Unlock 5 Mins",
    sub: "Only $1 · jump back to Aisha",
    coins: 50,
    price: "$1.00",
    neon: "green",
  },
  {
    id: "popular_50",
    headline: "Popular: 50 Coins",
    sub: "Best first recharge · most chosen",
    coins: 50,
    price: "$0.99",
    neon: "pink",
    popular: true,
  },
  {
    id: "boost_300",
    headline: "Hot Boost · 300 Coins",
    sub: "Talk longer · VIP frame unlock",
    coins: 300,
    price: "$4.99",
    neon: "gold",
  },
];

export const WELCOME_PUSH_CONFIG = {
  /** Settle-in delay after home loads before incoming modal */
  launchDelayMs: 3000,
  /** Teaser hard-cut timestamp */
  teaserCutMs: 3500,
  /** Paywall FOMO countdown */
  offerSeconds: 59,
  storageKey: "luma_welcome_push_v1",
} as const;
