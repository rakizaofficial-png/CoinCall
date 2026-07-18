/**
 * Shared in-memory host presence for the Luma call bridge.
 * Used by the main API (heartbeat / list / calls) and admin host actions.
 */

export type HostWorkspaceMode = 'waiting_1v1' | 'solo_calling';

export type HostPresence = {
  id: string;
  name: string;
  avatarUrl?: string;
  country?: string;
  ratePerMinute: number;
  isOnline: boolean;
  isLive: boolean;
  isOnCall: boolean;
  /** Ready for a new 1v1 call (online, not busy, not live). */
  readyToCall: boolean;
  workspaceMode?: HostWorkspaceMode;
  hostStatus?: string;
  lastSeen: number;
};

const HOST_TTL_MS = Number(process.env.HOST_TTL_MS || 90_000);

const hosts = new Map<string, HostPresence>();

export function computeReadyToCall(input: {
  isOnline: boolean;
  isOnCall: boolean;
  isLive: boolean;
}): boolean {
  return Boolean(input.isOnline && !input.isOnCall && !input.isLive);
}

export function pruneHosts(now = Date.now()) {
  for (const [id, h] of hosts) {
    if (now - h.lastSeen > HOST_TTL_MS) {
      hosts.delete(id);
    }
  }
}

export function upsertPresence(record: HostPresence) {
  if (!record.isOnline) {
    hosts.delete(record.id);
    return;
  }
  hosts.set(record.id, {
    ...record,
    readyToCall: computeReadyToCall(record),
  });
}

export function getPresence(id: string): HostPresence | undefined {
  return hosts.get(id);
}

export function setPresence(id: string, record: HostPresence) {
  hosts.set(id, {
    ...record,
    readyToCall: computeReadyToCall(record),
  });
}

export function removePresence(id: string) {
  hosts.delete(id);
}

export function listPresence(): HostPresence[] {
  return [...hosts.values()];
}

export function presenceCountOnline() {
  return [...hosts.values()].filter((h) => h.isOnline).length;
}

export function clearPresenceForAdminAction(
  hostId: string,
  action:
    | 'ban'
    | 'suspend'
    | 'force_offline'
    | 'disable_calls'
    | 'reject'
    | string,
) {
  if (
    action === 'ban' ||
    action === 'suspend' ||
    action === 'force_offline' ||
    action === 'disable_calls' ||
    action === 'reject'
  ) {
    hosts.delete(hostId);
    return true;
  }
  return false;
}
