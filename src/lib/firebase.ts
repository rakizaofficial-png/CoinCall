import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { Platform } from 'react-native';
import { env } from '../config/env';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Database | null = null;
let storage: FirebaseStorage | null = null;

export function isFirebaseReady() {
  return Boolean(
    env.firebase.apiKey &&
      env.firebase.projectId &&
      env.firebase.appId &&
      env.firebase.authDomain,
  );
}

export function getFirebaseApp() {
  if (!isFirebaseReady()) {
    throw new Error('Firebase keys missing in .env');
  }
  if (!app) {
    app =
      getApps()[0] ??
      initializeApp({
        apiKey: env.firebase.apiKey,
        authDomain: env.firebase.authDomain,
        projectId: env.firebase.projectId,
        storageBucket: env.firebase.storageBucket,
        messagingSenderId: env.firebase.messagingSenderId,
        appId: env.firebase.appId,
        databaseURL:
          env.firebase.databaseURL ||
          `https://${env.firebase.projectId}-default-rtdb.firebaseio.com`,
      });
  }
  return app;
}

/**
 * Web can use default getAuth().
 * Native MUST use initializeAuth + AsyncStorage persistence, or Firebase
 * often crashes / asserts on Hermes (IndexedDB missing).
 */
export function getFirebaseAuth() {
  if (auth) return auth;

  const firebaseApp = getFirebaseApp();

  if (Platform.OS === 'web') {
    auth = getAuth(firebaseApp);
    return auth;
  }

  try {
    // getReactNativePersistence exists in the RN firebase auth bundle;
    // public TS types often omit it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getReactNativePersistence } = require('firebase/auth') as {
      getReactNativePersistence: (storage: typeof AsyncStorage) => unknown;
    };
    auth = initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage) as never,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Already initialized (Fast Refresh / second call)
    if (/already-initialized|already been initialized/i.test(message)) {
      auth = getAuth(firebaseApp);
    } else {
      // Last resort — never throw at startup
      console.warn('[firebase] initializeAuth failed, falling back to getAuth', message);
      try {
        auth = getAuth(firebaseApp);
      } catch (fallbackErr) {
        console.warn('[firebase] getAuth also failed', fallbackErr);
        throw fallbackErr;
      }
    }
  }

  return auth;
}

export function getFirebaseDb() {
  if (!db) db = getDatabase(getFirebaseApp());
  return db;
}

export function getFirebaseStorage() {
  if (!storage) storage = getStorage(getFirebaseApp());
  return storage;
}
