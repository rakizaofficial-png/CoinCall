import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
};

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api').replace(
  /\/$/,
  '',
);
export const adminKey = import.meta.env.VITE_ADMIN_KEY || 'coincall-admin';
export const agoraAppId = import.meta.env.VITE_AGORA_APP_ID || '';

export const firebaseReady = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId && firebaseConfig.databaseURL,
);

export const app = firebaseReady ? initializeApp(firebaseConfig) : null;
export const db = app ? getDatabase(app) : null;
