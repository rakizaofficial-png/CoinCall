import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'coincall_host_live_call_settings_v1';

export type LiveCallSettings = {
  /** Allow 1v1 video calls while host is LIVE */
  acceptCallsWhileLive: boolean;
  /** Host earning rate shown / used for live private calls */
  coinsPerMinute: number;
  /** Auto-reject new rings if already on a private call */
  autoRejectWhenBusy: boolean;
  /** Max ring time before auto-reject (seconds) */
  maxWaitSec: number;
  /** Show as available for private calls from live */
  callAvailability: 'available' | 'busy' | 'offline';
};

export const DEFAULT_LIVE_CALL_SETTINGS: LiveCallSettings = {
  acceptCallsWhileLive: true,
  coinsPerMinute: 80,
  autoRejectWhenBusy: true,
  maxWaitSec: 45,
  callAvailability: 'available',
};

export async function loadLiveCallSettings(): Promise<LiveCallSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_LIVE_CALL_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<LiveCallSettings>;
    return {
      ...DEFAULT_LIVE_CALL_SETTINGS,
      ...parsed,
      coinsPerMinute: Math.max(
        10,
        Math.min(5000, Number(parsed.coinsPerMinute) || 80),
      ),
      maxWaitSec: Math.max(15, Math.min(120, Number(parsed.maxWaitSec) || 45)),
    };
  } catch {
    return { ...DEFAULT_LIVE_CALL_SETTINGS };
  }
}

export async function saveLiveCallSettings(
  patch: Partial<LiveCallSettings>,
): Promise<LiveCallSettings> {
  const current = await loadLiveCallSettings();
  const next = { ...current, ...patch };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
