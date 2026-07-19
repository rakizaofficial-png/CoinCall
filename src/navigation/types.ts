export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Live: undefined;
  Chat: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  MainTabs: undefined;
  HostProfile: { hostId: string };
  Call: {
    hostId: string;
    bridgeCallId?: string;
    channel?: string;
    peerName?: string;
    peerAvatar?: string;
    ratePerMinute?: number;
    role?: 'host' | 'user';
  };
  DirectChat: { peerId: string; peerName?: string; peerAvatar?: string };
  Notifications: undefined;
  Settings: undefined;
  GoLive: { mode?: 'solo' | 'party' };
  LiveRoom: { roomId: string; hostMode?: boolean };
  Withdraw: undefined;
  Calling: undefined;
};
