import { push, ref, set } from 'firebase/database';
import { getFirebaseDb, isFirebaseReady } from '../lib/firebase';
import { env } from '../config/env';

export async function submitUserReport(input: {
  reporterId: string;
  reporterName: string;
  targetId: string;
  reason: string;
  details?: string;
}) {
  const payload = {
    reporterId: input.reporterId,
    reporterName: input.reporterName,
    targetId: input.targetId,
    reason: input.reason,
    details: input.details || '',
    createdAt: Date.now(),
    status: 'open' as const,
  };

  if (isFirebaseReady()) {
    const reportRef = push(ref(getFirebaseDb(), 'reports'));
    await set(reportRef, payload);
    return { id: reportRef.key || `report_${Date.now()}`, ...payload };
  }

  const base = env.apiBaseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Could not submit report');
  }
  return (await res.json()) as { id: string };
}
