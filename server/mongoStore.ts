/**
 * Optional MongoDB snapshot layer.
 * When MONGODB_URI or DATABASE_URL (mongodb*) is set, snapshots are also
 * upserted to Mongo. Disk remains the always-on fallback so Render never
 * crashes if Mongo is missing or unreachable.
 */
import type { PersistedSnapshot } from './persistStore.ts';
import type { Db, MongoClient } from 'mongodb';

const URI = (process.env.MONGODB_URI || process.env.DATABASE_URL || '').trim();
const DB_NAME = process.env.MONGODB_DB || 'coincall';
const DOC_ID = 'main';

type MongoCollection = {
  findOne: (q: Record<string, unknown>) => Promise<{ snapshot?: PersistedSnapshot } | null>;
  updateOne: (
    q: Record<string, unknown>,
    u: Record<string, unknown>,
    o: { upsert: boolean },
  ) => Promise<unknown>;
};

type MongoClientLike = {
  connect: () => Promise<unknown>;
  db: (name: string) => { collection: (name: string) => MongoCollection };
  close: () => Promise<void>;
};

let client: MongoClientLike | null = null;
let database: Db | null = null;
let collection: MongoCollection | null = null;
let mongoReady = false;

export function mongoConfigured(): boolean {
  return Boolean(URI) && URI.startsWith('mongodb');
}

export function mongoConnected(): boolean {
  return mongoReady;
}

/**
 * Payment writes deliberately do not use the disk snapshot fallback. Payments
 * require MongoDB transactions and therefore fail closed when Mongo is absent.
 */
export function requireMongoDb(): Db {
  if (!mongoReady || !database) {
    throw new Error('PAYMENTS_DATABASE_UNAVAILABLE');
  }
  return database;
}

export function requireMongoClient(): MongoClient {
  if (!mongoReady || !client) {
    throw new Error('PAYMENTS_DATABASE_UNAVAILABLE');
  }
  return client as unknown as MongoClient;
}

export function persistenceLabel(): string {
  if (mongoReady) return 'mongo+disk';
  if (mongoConfigured()) return 'disk_mongo_pending';
  if (process.env.DATA_DIR) return 'data_dir';
  return 'local_dot_data';
}

export async function initMongo(): Promise<boolean> {
  if (!URI) return false;
  if (!URI.startsWith('mongodb')) {
    console.warn(
      '[persist] DATABASE_URL/MONGODB_URI is set but is not a mongodb:// URI — using disk only',
    );
    return false;
  }
  try {
    const mod = await import('mongodb');
    const MongoClient = mod.MongoClient as unknown as new (uri: string) => MongoClientLike;
    client = new MongoClient(URI);
    await client.connect();
    database = client.db(DB_NAME) as unknown as Db;
    collection = database.collection('coincall_snapshots') as unknown as MongoCollection;
    mongoReady = true;
    console.log(`[persist] MongoDB connected (db=${DB_NAME})`);
    return true;
  } catch (e) {
    mongoReady = false;
    client = null;
    database = null;
    collection = null;
    console.warn('[persist] MongoDB unavailable — continuing with disk fallback', e);
    return false;
  }
}

export async function loadMongoSnapshot(): Promise<PersistedSnapshot | null> {
  if (!collection) return null;
  try {
    const doc = await collection.findOne({ _id: DOC_ID });
    const snap = doc?.snapshot;
    if (!snap || snap.version !== 1) return null;
    return snap;
  } catch (e) {
    console.warn('[persist] mongo load failed', e);
    return null;
  }
}

export async function saveMongoSnapshot(snap: PersistedSnapshot): Promise<void> {
  if (!collection) return;
  try {
    await collection.updateOne(
      { _id: DOC_ID },
      { $set: { snapshot: snap, updatedAt: Date.now() } },
      { upsert: true },
    );
  } catch (e) {
    console.warn('[persist] mongo save failed (disk still written)', e);
  }
}

export async function closeMongo(): Promise<void> {
  if (!client) return;
  try {
    await client.close();
  } catch {
    /* ignore */
  }
  client = null;
  collection = null;
  database = null;
  mongoReady = false;
}
