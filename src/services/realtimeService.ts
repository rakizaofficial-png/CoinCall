import { onValue, push, ref, remove, set, update } from 'firebase/database';
import { getFirebaseDb, isFirebaseReady } from '../lib/firebase';
import type { HostStatus } from '../types/models';

export type ActiveCallRecord = {
  id: string;
  channel: string;
  hostUid: string;
  hostName: string;
  hostAvatar?: string;
  peerId: string;
  peerName: string;
  startedAt: number;
  status: 'active' | 'ended';
  coinsEarned?: number;
  seconds?: number;
};

export type HostControlCommand = {
  type: 'end_call' | 'force_offline' | 'force_online' | 'ban' | 'message' | 'kick_live';
  message?: string;
  at: number;
  by: 'admin';
};

/** Register live 1:1 so admin panel can see & silently join */
export async function publishActiveCall(input: {
  channel: string;
  hostUid: string;
  hostName: string;
  hostAvatar?: string;
  peerId: string;
  peerName: string;
}) {
  if (!isFirebaseReady()) return null;
  const db = getFirebaseDb();
  const callRef = push(ref(db, 'activeCalls'));
  const record: ActiveCallRecord = {
    id: callRef.key!,
    channel: input.channel,
    hostUid: input.hostUid,
    hostName: input.hostName,
    hostAvatar: input.hostAvatar,
    peerId: input.peerId,
    peerName: input.peerName,
    startedAt: Date.now(),
    status: 'active',
    coinsEarned: 0,
    seconds: 0,
  };
  await set(callRef, record);
  return record;
}

export async function updateActiveCall(
  callId: string,
  patch: Partial<ActiveCallRecord>,
) {
  if (!isFirebaseReady() || !callId) return;
  await update(ref(getFirebaseDb(), `activeCalls/${callId}`), patch);
}

export async function endActiveCall(callId: string | null | undefined) {
  if (!isFirebaseReady() || !callId) return;
  await remove(ref(getFirebaseDb(), `activeCalls/${callId}`));
}

export async function syncHostPresence(
  uid: string,
  patch: Record<string, unknown>,
) {
  if (!isFirebaseReady() || !uid) return;
  await update(ref(getFirebaseDb(), `hosts/${uid}`), {
    ...patch,
    updatedAt: Date.now(),
  });
}

export function listenHostControl(
  uid: string,
  onCommand: (cmd: HostControlCommand) => void,
) {
  if (!isFirebaseReady() || !uid) return () => undefined;
  const controlRef = ref(getFirebaseDb(), `hosts/${uid}/control`);
  return onValue(controlRef, (snap) => {
    if (!snap.exists()) return;
    const cmd = snap.val() as HostControlCommand;
    if (!cmd?.type || !cmd.at) return;
    onCommand(cmd);
    // Clear after consume so it does not re-fire
    void remove(controlRef);
  });
}

export async function adminSetHostStatus(
  uid: string,
  status: HostStatus,
  extra: Record<string, unknown> = {},
) {
  if (!isFirebaseReady()) throw new Error('Firebase not ready');
  await update(ref(getFirebaseDb(), `hosts/${uid}`), {
    hostStatus: status,
    isVerified: status === 'approved',
    ...extra,
    updatedAt: Date.now(),
  });
}

export async function adminSendHostControl(
  uid: string,
  cmd: Omit<HostControlCommand, 'at' | 'by'>,
) {
  if (!isFirebaseReady()) throw new Error('Firebase not ready');
  await set(ref(getFirebaseDb(), `hosts/${uid}/control`), {
    ...cmd,
    at: Date.now(),
    by: 'admin',
  });
}
