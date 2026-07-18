/**
 * Host client env — production keys only via EXPO_PUBLIC_* (no secrets).
 *
 * SETUP:
 * 1. Copy values from server/.env.example guidance
 * 2. Expo: create `.env` at CoinCall root with EXPO_PUBLIC_API_BASE_URL + AGORA_APP_ID
 * 3. Firebase keys for auth/FCM as needed
 */

export { env, getMissingProductionKeys, isConfigured } from './env';
