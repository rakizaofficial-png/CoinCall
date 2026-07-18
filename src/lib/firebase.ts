import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
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

export function getFirebaseAuth() {
  if (!auth) auth = getAuth(getFirebaseApp());
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
