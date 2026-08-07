import 'dotenv/config';
import { createHash } from 'crypto';
import { closeMongo, initMongo, loadMongoSnapshot, requireMongoDb } from './mongoStore.ts';
import { ensurePaymentIndexes } from './paymentStore.ts';

if (!(await initMongo())) throw new Error('MongoDB is required for payment migration');
const db = requireMongoDb();
const snapshot = await loadMongoSnapshot();
await ensurePaymentIndexes();

if (snapshot) {
  for (const raw of snapshot.wallets || []) {
    const userId = String(raw.userId || '');
    if (!userId) continue;
    await db.collection('wallet_accounts').updateOne({ userId }, {
      $setOnInsert: { userId, balance: Math.max(0, Number(raw.coinBalance) || 0), debt: 0,
        frozen: false, createdAt: new Date(Number(raw.createdAt) || Date.now()) },
      $set: { updatedAt: new Date() },
    }, { upsert: true });
  }
  for (const group of snapshot.walletLedger || []) {
    for (const raw of group.entries || []) {
      const sourceId = String(raw.id || JSON.stringify(raw));
      await db.collection('wallet_ledger').updateOne({
        idempotencyKey: `legacy:${createHash('sha256').update(`${group.userId}:${sourceId}`).digest('hex')}`,
      }, { $setOnInsert: {
        id: sourceId, userId: group.userId, type: 'LEGACY_IMPORT', amount: Number(raw.amount) || 0,
        reason: String(raw.reason || 'legacy'),
        idempotencyKey: `legacy:${createHash('sha256').update(`${group.userId}:${sourceId}`).digest('hex')}`,
        createdAt: new Date(Number(raw.at) || Date.now()),
      } }, { upsert: true });
    }
  }
}
console.log(`[payments:migrate] complete; snapshot=${Boolean(snapshot)}`);
await closeMongo();
