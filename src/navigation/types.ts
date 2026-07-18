export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Live: undefined;
  Earnings: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  MainTabs: undefined;
  HostProfile: { hostId: string };
  Call: {
    hostId: string;
    /** When set, this is a live user↔host bridge call */
    bridgeCallId?: string;
    channel?: string;
    peerName?: string;
    peerAvatar?: string;
    ratePerMinute?: number;
    role?: 'host' | 'user';
  };
  Chat: { hostId: string };
  Notifications: undefined;
};
