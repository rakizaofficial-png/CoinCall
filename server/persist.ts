/**
 * Lightweight durable store for wallets / ledgers on disk.
 * Survives process restarts on the same instance (Render free disk is ephemeral
 * across redeploys — set DATABASE_URL later for multi-instance Mongo).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), '.data');
const WALLET_FILE = join(DATA_DIR, 'wallets.json');

export type PersistedWallet = {
  userId: string;
  coinBalance: number;
  xp: number;
  isPremium: boolean;
  displayName: string;
  avatarUrl?: string;
  role: 'user' | 'host';
};

export type PersistedLedger = {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  kind: 'credit' | 'spend';
  at: number;
};

type Snapshot = {
  wallets: PersistedWallet[];
  ledger: Record<string, PersistedLedger[]>;
  iapReceipts: string[];
};

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function loadWalletSnapshot(): Snapshot | null {
  try {
    if (!existsSync(WALLET_FILE)) return null;
    const raw = readFileSync(WALLET_FILE, 'utf8');
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null;
  }
}

export function saveWalletSnapshot(snap: Snapshot) {
  try {
    ensureDir();
    writeFileSync(WALLET_FILE, JSON.stringify(snap), 'utf8');
  } catch (e) {
    console.warn('[persist] wallet save failed', e);
  }
}
