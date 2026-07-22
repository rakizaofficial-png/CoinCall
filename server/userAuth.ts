/**
 * Email+password user accounts for Zuko / Luma.
 * Passwords hashed with scrypt; accounts persisted via disk snapshot hooks.
 */
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export type UserAccount = {
  userId: string;
  email: string;
  displayName: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
  token: string;
};

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), '.data');
const FILE = join(DATA_DIR, 'user-accounts.json');

const byEmail = new Map<string, UserAccount>();
const byToken = new Map<string, UserAccount>();
const byId = new Map<string, UserAccount>();

function normalizeEmail(email: string) {
  return String(email || '').trim().toLowerCase();
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString('hex');
}

function load() {
  try {
    if (!existsSync(FILE)) return;
    const rows = JSON.parse(readFileSync(FILE, 'utf8')) as UserAccount[];
    for (const row of rows) {
      byEmail.set(row.email, row);
      byId.set(row.userId, row);
      byToken.set(row.token, row);
    }
  } catch {
    /* ignore */
  }
}

function save() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify([...byEmail.values()]), 'utf8');
  } catch (e) {
    console.warn('[userAuth] save failed', e);
  }
}

load();

export function dumpUserAccounts(): UserAccount[] {
  return [...byEmail.values()];
}

export function loadUserAccounts(rows: UserAccount[]) {
  for (const row of rows || []) {
    if (!row?.email || !row?.userId) continue;
    byEmail.set(row.email, row);
    byId.set(row.userId, row);
    byToken.set(row.token, row);
  }
}

export function registerUser(input: {
  email: string;
  password: string;
  displayName: string;
}): { ok: true; account: UserAccount } | { ok: false; error: string; status: number } {
  const email = normalizeEmail(input.email);
  const password = String(input.password || '');
  const displayName = String(input.displayName || '').trim().slice(0, 40) || 'Zuko Fan';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Valid email required', status: 400 };
  }
  if (password.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters', status: 400 };
  }
  if (byEmail.has(email)) {
    return { ok: false, error: 'Email already registered', status: 409 };
  }
  const salt = randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const account: UserAccount = {
    userId: `u_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    email,
    displayName,
    passwordHash,
    salt,
    createdAt: Date.now(),
    token: randomBytes(24).toString('hex'),
  };
  byEmail.set(email, account);
  byId.set(account.userId, account);
  byToken.set(account.token, account);
  save();
  return { ok: true, account };
}

export function loginUser(input: {
  email: string;
  password: string;
}): { ok: true; account: UserAccount } | { ok: false; error: string; status: number } {
  const email = normalizeEmail(input.email);
  const password = String(input.password || '');
  const account = byEmail.get(email);
  if (!account) {
    return { ok: false, error: 'Invalid email or password', status: 401 };
  }
  const next = hashPassword(password, account.salt);
  const a = Buffer.from(account.passwordHash, 'hex');
  const b = Buffer.from(next, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: 'Invalid email or password', status: 401 };
  }
  // Rotate session token
  byToken.delete(account.token);
  account.token = randomBytes(24).toString('hex');
  byToken.set(account.token, account);
  save();
  return { ok: true, account };
}

export function publicAuthUser(account: UserAccount) {
  return {
    token: account.token,
    userId: account.userId,
    email: account.email,
    displayName: account.displayName,
  };
}
