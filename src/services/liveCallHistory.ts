/**
 * Local call history for private video calls accepted from Live.
 * Complements server /hosts/:id/calls with richer UI fields.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'coincall_host_live_call_history_v1';

export type LiveCallHistoryRow = {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  country?: string;
  startTime: number;
  endTime: number;
  durationSec: number;
  coinsEarned: number;
  ratePerMinute: number;
  status: 'completed' | 'rejected' | 'missed' | 'failed' | 'busy';
  fromLive: boolean;
};

export async function listLiveCallHistory(limit = 50): Promise<LiveCallHistoryRow[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const rows = JSON.parse(raw) as LiveCallHistoryRow[];
    return (Array.isArray(rows) ? rows : [])
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
  } catch {
    return [];
  }
}

export async function pushLiveCallHistory(row: LiveCallHistoryRow) {
  const prev = await listLiveCallHistory(200);
  const next = [row, ...prev.filter((r) => r.id !== row.id)].slice(0, 200);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}
