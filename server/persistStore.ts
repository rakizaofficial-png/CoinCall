/**
 * Durable JSON snapshot for critical API state.
 * Survives process restarts on the same machine/volume.
 * On Render free tier the disk is ephemeral across deploys — set DATA_DIR
 * to a persistent disk mount when available, and/or MONGODB_URI for Mongo.
 * Disk writes always succeed independently of Mongo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { saveMongoSnapshot } from './mongoStore.ts';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), '.data');
const SNAPSHOT = path.join(DATA_DIR, 'coincall-snapshot.json');

export type PersistedSnapshot = {
  version: 1;
  savedAt: number;
  wallets: Array<Record<string, unknown>>;
  walletLedger: Array<{ userId: string; entries: Array<Record<string, unknown>> }>;
  withdrawals: Array<Record<string, unknown>>;
  reports: Array<Record<string, unknown>>;
  massTextHistory: Array<Record<string, unknown>>;
  iapReceipts: string[];
  supportTickets: Array<Record<string, unknown>>;
  liveRooms: Array<Record<string, unknown>>;
  /** Optional 1:1 DM chats (user ↔ host) */
  dmChats?: Array<Record<string, unknown>>;
  /** Ended / missed / rejected call archive */
  callHistory?: Array<Record<string, unknown>>;
  /** Gift send ledger for host revenue */
  giftHistory?: Array<Record<string, unknown>>;
  /** Ended live sessions for host live-time stats */
  liveSessionHistory?: Array<Record<string, unknown>>;
  /** Host DP binaries (base64) so avatars survive redeploy */
  avatars?: Array<{
    hostId: string;
    contentType: string;
    updatedAt: number;
    base64: string;
  }>;
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function ensureDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

function writeDisk(snap: PersistedSnapshot) {
  ensureDataDir();
  const tmp = `${SNAPSHOT}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(snap));
  fs.renameSync(tmp, SNAPSHOT);
  void saveMongoSnapshot(snap);
}

export function loadSnapshot(): PersistedSnapshot | null {
  try {
    ensureDataDir();
    if (!fs.existsSync(SNAPSHOT)) return null;
    const raw = fs.readFileSync(SNAPSHOT, 'utf8');
    const data = JSON.parse(raw) as PersistedSnapshot;
    if (!data || data.version !== 1) return null;
    return data;
  } catch (e) {
    console.warn('[persist] load failed', e);
    return null;
  }
}

export function scheduleSave(build: () => PersistedSnapshot) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      writeDisk(build());
    } catch (e) {
      console.warn('[persist] save failed', e);
    }
  }, 800);
}

export function saveNow(build: () => PersistedSnapshot) {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    writeDisk(build());
  } catch (e) {
    console.warn('[persist] saveNow failed', e);
  }
}
