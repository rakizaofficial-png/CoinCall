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
    peerCountry?: string;
    peerCoins?: number;
    ratePerMinute?: number;
    role?: 'host' | 'user';
    fromLive?: boolean;
    liveRoomId?: string;
  };
  DirectChat: { peerId: string; peerName?: string; peerAvatar?: string };
  FanProfile: { userId: string; userName?: string; avatarUrl?: string };
  Notifications: undefined;
  Settings: undefined;
  SystemInformation: undefined;
  HelpCenter: undefined;
  GoLive: { mode?: 'solo' | 'party' };
  LiveRoom: { roomId: string; hostMode?: boolean };
  Withdraw: undefined;
  Calling: undefined;
  Earnings: undefined;
  CoinHistory: undefined;
  CallHistory: undefined;
  EditHostProfile: undefined;
};
