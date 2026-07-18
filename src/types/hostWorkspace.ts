/** Host downtime / call workspace modes (persistent global state) */
export type HostWorkspaceMode =
  | 'waiting_1v1'
  | 'solo_calling'
  | 'pk_battle'
  | 'party_room';

/** Coarse presence broadcast to the rest of the app */
export type HostPresenceStatus =
  | 'offline'
  | 'online'
  | 'solo_calling'
  | 'party_room';

export type PartySeat = {
  index: number;
  occupied: boolean;
  hostId: string | null;
  name: string;
  avatarUrl: string;
  isMe: boolean;
  isSpeaking: boolean;
  micOn: boolean;
};

export type PkTeamSide = 'pink' | 'blue';

export type PkBattleState = {
  active: boolean;
  mySide: PkTeamSide;
  pinkPoints: number;
  bluePoints: number;
  pinkHost: {
    id: string;
    name: string;
    avatarUrl: string;
  };
  blueHost: {
    id: string;
    name: string;
    avatarUrl: string;
  };
  secondsLeft: number;
  engagementTick: number;
};
