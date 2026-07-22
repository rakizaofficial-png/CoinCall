import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { User } from '../types/models';

const SESSION_KEY = 'coincall_host_session_v2';
const REMEMBER_KEY = 'coincall_host_remember_v1';
const REFRESH_KEY = 'coincall_host_refresh_v1';

async function secureSet(key: string, value: string) {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    await AsyncStorage.setItem(key, value);
  }
}

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return AsyncStorage.getItem(key);
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return AsyncStorage.getItem(key);
  }
}

async function secureDelete(key: string) {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(key);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    await AsyncStorage.removeItem(key);
  }
}

export type HostSession = {
  user: User;
  remembered: boolean;
  savedAt: number;
  refreshToken?: string;
};

/** Persist host profile so UI can restore instantly while Firebase Auth hydrates. */
export async function saveHostSession(user: User, remembered = true) {
  const session: HostSession = {
    user: { ...user, role: 'host' },
    remembered,
    savedAt: Date.now(),
  };
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  await AsyncStorage.setItem(REMEMBER_KEY, remembered ? '1' : '0');
  // Store a refresh marker (Firebase refreshes ID tokens internally; we keep a local nonce)
  const refresh = `rt_${user.id}_${Date.now()}`;
  await secureSet(REFRESH_KEY, refresh);
  return refresh;
}

export async function loadHostSession(): Promise<HostSession | null> {
  try {
    const remember = await AsyncStorage.getItem(REMEMBER_KEY);
    if (remember === '0') return null;
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HostSession;
    if (!parsed?.user?.id) return null;
    const refresh = await secureGet(REFRESH_KEY);
    return { ...parsed, refreshToken: refresh || parsed.refreshToken };
  } catch {
    return null;
  }
}

export async function clearHostSession() {
  await AsyncStorage.removeItem(SESSION_KEY);
  await AsyncStorage.removeItem(REMEMBER_KEY);
  await secureDelete(REFRESH_KEY);
  // Legacy key from older builds
  await AsyncStorage.removeItem('coincall_host_user_v1');
}

export async function isRememberMeEnabled() {
  const v = await AsyncStorage.getItem(REMEMBER_KEY);
  return v !== '0';
}

export async function setRememberMe(enabled: boolean) {
  await AsyncStorage.setItem(REMEMBER_KEY, enabled ? '1' : '0');
}
