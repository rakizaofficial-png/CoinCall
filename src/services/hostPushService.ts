/**
 * Firebase Cloud Messaging / Expo Push for Host alerts.
 * Registers device token with CoinCall API and handles foreground notifications.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { env } from '../config/env';

let Notifications: typeof import('expo-notifications') | null = null;

async function loadNotifications() {
  if (Notifications) return Notifications;
  try {
    Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    Notifications = null;
  }
  return Notifications;
}

function apiBase() {
  return (env.apiBaseUrl || 'https://coincall-api.onrender.com/api').replace(/\/$/, '');
}

export type HostPushCategory =
  | 'chat'
  | 'call'
  | 'gift'
  | 'coin'
  | 'withdrawal'
  | 'announcement'
  | 'live';

export async function registerHostPushToken(hostId: string): Promise<string | null> {
  if (Platform.OS === 'web' || !hostId) return null;
  const mod = await loadNotifications();
  if (!mod) return null;

  try {
    const { status: existing } = await mod.getPermissionsAsync();
    let final = existing;
    if (existing !== 'granted') {
      const req = await mod.requestPermissionsAsync();
      final = req.status;
    }
    if (final !== 'granted') return null;

    if (Platform.OS === 'android') {
      await mod.setNotificationChannelAsync('coincall-host', {
        name: 'CoinCall Host',
        importance: mod.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 120, 250],
        lightColor: '#FF4D8D',
        sound: 'default',
      });
    }

    const projectId =
      Constants.easConfig?.projectId ||
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
        ?.projectId;
    const tokenData = await mod.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenData.data;
    if (!token) return null;

    await fetch(`${apiBase()}/hosts/${encodeURIComponent(hostId)}/push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': hostId,
      },
      body: JSON.stringify({
        token,
        platform: Platform.OS,
        categories: [
          'chat',
          'call',
          'gift',
          'coin',
          'withdrawal',
          'announcement',
          'live',
        ],
      }),
    }).catch(() => undefined);

    return token;
  } catch (e) {
    console.warn('FCM register failed', e);
    return null;
  }
}

export function listenHostPush(
  onNotification: (title: string, body: string, data?: Record<string, unknown>) => void,
): () => void {
  let sub: { remove: () => void } | undefined;
  void loadNotifications().then((mod) => {
    if (!mod) return;
    sub = mod.addNotificationReceivedListener((n) => {
      const c = n.request.content;
      onNotification(c.title || 'CoinCall', c.body || '', (c.data || {}) as Record<string, unknown>);
    });
  });
  return () => sub?.remove();
}
