import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
  type User as FirebaseUser,
  type Unsubscribe,
} from 'firebase/auth';
import { onValue, ref, set, update } from 'firebase/database';
import { getFirebaseAuth, getFirebaseDb, isFirebaseReady } from '../lib/firebase';
import type { HostStatus, User, UserRole } from '../types/models';

function mapHostUser(uid: string, data: Record<string, unknown>, fallbackName: string): User {
  const status = (data.hostStatus as HostStatus) || 'none';
  return {
    id: uid,
    name: String(data.name ?? fallbackName),
    email: data.email ? String(data.email) : undefined,
    phone: data.phone ? String(data.phone) : undefined,
    role: (data.role as UserRole) || 'host',
    coinBalance: Number(data.coinBalance ?? 0),
    diamonds: Number(data.diamonds ?? 0),
    gems: Number(data.gems ?? 0),
    level: Number(data.level ?? 1),
    isVerified: status === 'approved',
    avatarUrl: String(
      data.photoUrl ||
        data.avatarUrl ||
        `https://i.pravatar.cc/300?u=${encodeURIComponent(uid)}`,
    ),
    isOnline: Boolean(data.isOnline ?? false),
    hostId: data.hostId ? String(data.hostId) : undefined,
    hostStatus: status,
    country: data.country ? String(data.country) : undefined,
    photoUrl: data.photoUrl
      ? String(data.photoUrl)
      : Array.isArray(data.photoUrls) && data.photoUrls[0]
        ? String(data.photoUrls[0])
        : undefined,
    photoUrls: Array.isArray(data.photoUrls)
      ? data.photoUrls.map(String)
      : data.photoUrl
        ? [String(data.photoUrl)]
        : undefined,
    videoUrl: data.videoUrl ? String(data.videoUrl) : undefined,
    applicationSubmittedAt: data.applicationSubmittedAt
      ? Number(data.applicationSubmittedAt)
      : undefined,
    rejectionReason: data.rejectionReason ? String(data.rejectionReason) : undefined,
    docsRequested: data.docsRequested ? String(data.docsRequested) : undefined,
    bio: data.bio ? String(data.bio) : undefined,
    languages: Array.isArray(data.languages) ? data.languages.map(String) : undefined,
    categories: Array.isArray(data.categories) ? data.categories.map(String) : undefined,
    callPrice: data.callPrice != null ? Number(data.callPrice) : undefined,
    idDocumentUrl: data.idDocumentUrl ? String(data.idDocumentUrl) : undefined,
    selfieUrl: data.selfieUrl ? String(data.selfieUrl) : undefined,
    banned: Boolean(data.banned),
    suspended: Boolean(data.suspended),
    callsEnabled: data.callsEnabled !== false,
    videoCallsEnabled: data.videoCallsEnabled !== false,
    voiceCallsEnabled: data.voiceCallsEnabled !== false,
    giftsEnabled: data.giftsEnabled !== false,
    withdrawalsAllowed: data.withdrawalsAllowed !== false,
    walletFrozen: Boolean(data.walletFrozen),
  };
}

function blankHostProfile(uid: string, name: string, email?: string): User {
  return {
    id: uid,
    name,
    email,
    role: 'host',
    coinBalance: 0,
    diamonds: 0,
    gems: 0,
    level: 1,
    isVerified: false,
    avatarUrl: `https://i.pravatar.cc/300?u=${encodeURIComponent(uid)}`,
    isOnline: false,
    hostStatus: 'none',
  };
}

export async function firebaseEmailSignUp(input: {
  name: string;
  email: string;
  password: string;
}) {
  if (!isFirebaseReady()) throw new Error('Firebase is not configured.');
  const auth = getFirebaseAuth();
  const cred = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
  await updateProfile(cred.user, { displayName: input.name.trim() });

  const profile = blankHostProfile(cred.user.uid, input.name.trim(), input.email.trim());
  await set(ref(getFirebaseDb(), `hosts/${cred.user.uid}`), {
    ...profile,
    createdAt: Date.now(),
  });

  return profile;
}

export async function firebaseEmailSignIn(input: { email: string; password: string }) {
  if (!isFirebaseReady()) throw new Error('Firebase is not configured.');
  const auth = getFirebaseAuth();
  const cred = await signInWithEmailAndPassword(auth, input.email.trim(), input.password);
  return loadHostProfile(cred.user);
}

export async function firebaseSignOut() {
  if (!isFirebaseReady()) return;
  await fbSignOut(getFirebaseAuth());
}

export async function loadHostProfile(fbUser: FirebaseUser): Promise<User> {
  const db = getFirebaseDb();
  const snapRef = ref(db, `hosts/${fbUser.uid}`);

  return new Promise((resolve, reject) => {
    const unsub = onValue(
      snapRef,
      async (snap) => {
        unsub();
        if (snap.exists()) {
          resolve(
            mapHostUser(
              fbUser.uid,
              snap.val() as Record<string, unknown>,
              fbUser.displayName || 'Host',
            ),
          );
          return;
        }
        const profile = blankHostProfile(
          fbUser.uid,
          fbUser.displayName || fbUser.email?.split('@')[0] || 'Host',
          fbUser.email || undefined,
        );
        await set(snapRef, { ...profile, createdAt: Date.now() });
        resolve(profile);
      },
      reject,
      { onlyOnce: true },
    );
  });
}

export function listenAuth(callback: (user: User | null) => void) {
  if (!isFirebaseReady()) {
    callback(null);
    return () => undefined;
  }

  let auth;
  try {
    auth = getFirebaseAuth();
  } catch (e) {
    console.warn('[auth] getFirebaseAuth failed', e);
    callback(null);
    return () => undefined;
  }

  let profileUnsub: Unsubscribe | null = null;

  const authUnsub = onAuthStateChanged(auth, (fbUser) => {
    if (profileUnsub) {
      profileUnsub();
      profileUnsub = null;
    }

    if (!fbUser) {
      callback(null);
      return;
    }

    profileUnsub = onValue(ref(getFirebaseDb(), `hosts/${fbUser.uid}`), async (snap) => {
      if (snap.exists()) {
        callback(
          mapHostUser(
            fbUser.uid,
            snap.val() as Record<string, unknown>,
            fbUser.displayName || 'Host',
          ),
        );
        return;
      }
      const profile = blankHostProfile(
        fbUser.uid,
        fbUser.displayName || fbUser.email?.split('@')[0] || 'Host',
        fbUser.email || undefined,
      );
      await set(ref(getFirebaseDb(), `hosts/${fbUser.uid}`), {
        ...profile,
        createdAt: Date.now(),
      });
      callback(profile);
    });
  });

  return () => {
    if (profileUnsub) profileUnsub();
    authUnsub();
  };
}

export async function submitHostApplicationToFirebase(
  uid: string,
  data: {
    name: string;
    country: string;
    photoUrl: string;
    photoUrls: string[];
    videoUrl: string;
    hostId: string;
    bio?: string;
    languages?: string[];
    categories?: string[];
    callPrice?: number;
    idDocumentUrl?: string;
    selfieUrl?: string;
  },
) {
  if (!isFirebaseReady()) throw new Error('Firebase is not configured.');
  await update(ref(getFirebaseDb(), `hosts/${uid}`), {
    name: data.name,
    country: data.country,
    photoUrl: data.photoUrl,
    photoUrls: data.photoUrls,
    videoUrl: data.videoUrl,
    avatarUrl: data.photoUrl,
    hostId: data.hostId,
    hostStatus: 'pending',
    applicationSubmittedAt: Date.now(),
    isVerified: false,
    isOnline: false,
    rejectionReason: null,
    docsRequested: null,
    bio: data.bio || '',
    languages: data.languages || [],
    categories: data.categories || [],
    callPrice: data.callPrice ?? 80,
    idDocumentUrl: data.idDocumentUrl || null,
    selfieUrl: data.selfieUrl || null,
    callsEnabled: true,
    videoCallsEnabled: true,
    voiceCallsEnabled: true,
    giftsEnabled: true,
    withdrawalsAllowed: true,
    walletFrozen: false,
    banned: false,
    suspended: false,
  });
}

export async function approveHostInFirebase(uid: string) {
  if (!isFirebaseReady()) throw new Error('Firebase is not configured.');
  await update(ref(getFirebaseDb(), `hosts/${uid}`), {
    hostStatus: 'approved',
    isVerified: true,
    coinBalance: 200,
    approvedAt: Date.now(),
  });
}
