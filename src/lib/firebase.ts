import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  // @ts-expect-error — RN persistence export exists in firebase/auth for react-native
  getReactNativePersistence,
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
 * Persistent Firebase Auth on native — survives app kill/relaunch.
 * Web uses default IndexedDB persistence via getAuth().
 */
export function getFirebaseAuth() {
  if (auth) return auth;
  const firebaseApp = getFirebaseApp();
  if (Platform.OS === 'web') {
    auth = getAuth(firebaseApp);
    return auth;
  }
  try {
    auth = initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Already initialized (Fast Refresh / second call)
    auth = getAuth(firebaseApp);
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
