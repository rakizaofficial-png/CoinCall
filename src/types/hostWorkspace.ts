/** Host downtime / call workspace modes (persistent global state) */
export type HostWorkspaceMode = 'waiting_1v1' | 'solo_calling';

/** Coarse presence broadcast to the rest of the app */
export type HostPresenceStatus = 'offline' | 'online' | 'solo_calling';

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
