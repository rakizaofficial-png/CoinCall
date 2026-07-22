import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { generateHostId } from '../data/countries';
import { isFirebaseReady } from '../lib/firebase';
import {
  approveHostInFirebase,
  firebaseEmailSignIn,
  firebaseEmailSignUp,
  firebaseSendPasswordReset,
  firebaseSignOut,
  listenAuth,
  submitHostApplicationToFirebase,
  updateHostProfileInFirebase,
} from '../services/authService';
import {
  uploadHostApplicationMedia,
  ensurePublicAvatarUrl,
} from '../services/mediaUploadService';
import { isPublicHttpAvatar } from '../utils/hostAvatar';
import {
  confirmPhoneOtp,
  sendPhoneOtp,
} from '../services/phoneAuthService';
import {
  clearHostSession,
  loadHostSession,
  saveHostSession,
} from '../services/sessionStore';
import type { User } from '../types/models';
import { callPriceForLevel } from '../utils/hostPricing';
import { Platform } from 'react-native';
import { env } from '../config/env';

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out. Please try again with a smaller photo.`)),
      ms,
    );
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

/** Push profile metadata (https URLs only) to CoinCall API → Mongo/disk for Luma */
async function syncHostProfileToApi(
  hostId: string,
  payload: {
    name: string;
    bio: string;
    country?: string;
    photoUrl?: string;
    photoUrls?: string[];
    videoUrl?: string;
    languages?: string[];
    categories?: string[];
    callPrice?: number;
  },
) {
  const base = (env.apiBaseUrl || 'https://coincall-api.onrender.com/api').replace(
    /\/$/,
    '',
  );
  const res = await fetch(`${base}/hosts/${encodeURIComponent(hostId)}/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': hostId,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Profile sync failed (${res.status})`);
  }
}

type AuthMethod = 'email' | 'phone';

export type SignUpInput = {
  name: string;
  email?: string;
  phone?: string;
  password?: string;
  isAgeVerified: boolean;
  method: AuthMethod;
};

export type SignInInput = {
  email?: string;
  phone?: string;
  password?: string;
  otp?: string;
  method: AuthMethod;
};

export type HostApplicationInput = {
  name: string;
  country: string;
  photoUrls: string[];
  videoUrl?: string;
  bio?: string;
  languages?: string[];
  categories?: string[];
  /** Ignored — price is derived from host level */
  callPrice?: number;
  idDocumentUri?: string;
  selfieUri?: string;
};

type AuthContextValue = {
  user: User | null;
  isAuthenticated: boolean;
  isHostApproved: boolean;
  usingFirebase: boolean;
  authReady: boolean;
  signIn: (input: SignInInput) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => void;
  setAuthUser: (user: User | null) => void;
  submitHostApplication: (
    input: HostApplicationInput,
    onStage?: (stage: string) => void,
  ) => Promise<void>;
  /** Dev-only helper — production hosts are approved from Admin panel */
  approveCurrentHost: () => Promise<void>;
  sendLoginOtp: (phone: string) => Promise<void>;
  /** Firebase email password reset (production) */
  sendPasswordReset: (email: string) => Promise<void>;
  /** Approved hosts: edit name, bio, photos, intro video */
  saveHostProfile: (
    input: {
      name: string;
      bio: string;
      country?: string;
      photoUrls: string[];
      videoUrl?: string;
      languages?: string[];
      categories?: string[];
    },
    onStage?: (stage: string) => void,
  ) => Promise<User>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function createMockUser(
  partial: Pick<User, 'name'> & Partial<User>,
): User {
  return {
    id: `host_${Date.now()}`,
    coinBalance: 0,
    diamonds: 0,
    gems: 0,
    level: 1,
    isVerified: false,
    avatarUrl: '',
    isOnline: false,
    hostStatus: 'none',
    appId: String(Math.floor(100000 + Math.random() * 900000)),
    ...partial,
    role: 'host',
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const usingFirebase = isFirebaseReady();

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;

    (async () => {
      // Instant restore from secure/local session (auto-login)
      const cached = await loadHostSession();
      if (!cancelled && cached?.user) {
        setUser({
          ...cached.user,
          hostStatus: cached.user.hostStatus || 'none',
          role: 'host',
        });
      }

      if (usingFirebase) {
        unsub = listenAuth((profile) => {
          if (cancelled) return;
          if (profile) {
            setUser(profile);
            void saveHostSession(profile, true);
          }
          // Keep cached session on null until explicit signOut clears it
          setAuthReady(true);
        });
        setTimeout(() => {
          if (!cancelled) setAuthReady(true);
        }, 2500);
        return;
      }

      if (!cancelled) setAuthReady(true);
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [usingFirebase]);

  const setAuthUser = useCallback((next: User | null) => {
    setUser(next);
    if (next) void saveHostSession(next, true);
    else void clearHostSession();
  }, []);

  const signIn = useCallback(async (input: SignInInput) => {
    if (input.method === 'phone') {
      if (!usingFirebase) {
        throw new Error('Phone login requires Firebase configuration.');
      }
      if (!input.phone?.trim() || !input.otp?.trim()) {
        throw new Error('Phone number and OTP are required.');
      }
      const profile = await confirmPhoneOtp(input.otp);
      setUser(profile);
      void saveHostSession(profile, true);
      return;
    }
    if (!input.email?.trim() || !input.password?.trim()) {
      throw new Error('Email and password are required.');
    }

    if (usingFirebase) {
      const profile = await firebaseEmailSignIn({
        email: input.email,
        password: input.password,
      });
      setUser(profile);
      void saveHostSession(profile, true);
      return;
    }

    const next = createMockUser({
      name: input.email.split('@')[0] || 'Host',
      email: input.email.trim(),
      hostStatus: 'none',
    });
    setAuthUser(next);
  }, [setAuthUser, usingFirebase]);

  const sendPasswordReset = useCallback(async (email: string) => {
    if (!isFirebaseReady()) {
      throw new Error('Password reset needs Firebase. Use demo login offline.');
    }
    await firebaseSendPasswordReset(email);
  }, []);

  const sendLoginOtp = useCallback(async (phone: string) => {
    if (!usingFirebase) {
      throw new Error('Phone OTP requires Firebase.');
    }
    if (Platform.OS !== 'web') {
      throw new Error('Phone OTP is available on the web host app. Use email on mobile builds.');
    }
    await sendPhoneOtp(phone);
  }, [usingFirebase]);

  const signUp = useCallback(async (input: SignUpInput) => {
    if (!input.name.trim()) throw new Error('Name is required.');
    if (!input.isAgeVerified) {
      throw new Error('You must confirm you are 18 or older.');
    }
    if (input.method === 'phone') {
      throw new Error('Use Login → Phone to verify OTP after sending the code from Login.');
    }
    if (!input.email?.trim() || !input.password?.trim()) {
      throw new Error('Email and password are required.');
    }
    if (input.password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    if (usingFirebase) {
      const profile = await firebaseEmailSignUp({
        name: input.name,
        email: input.email,
        password: input.password,
      });
      setUser(profile);
      void saveHostSession(profile, true);
      return;
    }

    setAuthUser(
      createMockUser({
        name: input.name.trim(),
        email: input.email.trim(),
        hostStatus: 'none',
      }),
    );
  }, [setAuthUser, usingFirebase]);

  const signOut = useCallback(() => {
    if (usingFirebase) {
      void firebaseSignOut();
    }
    void clearHostSession();
    setUser(null);
  }, [usingFirebase]);

  const submitHostApplication = useCallback(
    async (
      input: HostApplicationInput,
      onStage?: (stage: string) => void,
    ) => {
      if (!user) throw new Error('Please sign in first.');
      if (!input.name.trim()) throw new Error('Display name is required.');
      if (!input.country.trim()) throw new Error('Country is required.');
      if (!input.photoUrls?.length) {
        throw new Error('Please add at least 1 photo.');
      }

      const languages =
        input.languages?.length ? input.languages : ['English'];
      const categories =
        input.categories?.length ? input.categories : ['Talk'];
      const bio =
        input.bio?.trim() ||
        `${input.name.trim()} · CoinCall host`;
      const callPrice = callPriceForLevel(user.level || 1);

      const hostId = user.hostId || generateHostId();
      // Only process first photo for fast apply
      const photosLocal = input.photoUrls.slice(0, 1);

      onStage?.('photos');
      const uploaded = await withTimeout(
        uploadHostApplicationMedia(
          {
            hostUid: user.id,
            photoUris: photosLocal,
          },
          (stage) => onStage?.(stage),
        ),
        45_000,
        'Media prepare',
      );
      const photos = uploaded.photoUrls;
      if (!photos.length) throw new Error('Photo upload failed. Try another image.');
      // Prefer public https so Luma can show the real DP (never data:/blob:)
      let mainPhoto = photos[0];
      if (!isPublicHttpAvatar(mainPhoto)) {
        const published = await ensurePublicAvatarUrl(user.id, mainPhoto);
        if (published) mainPhoto = published;
      }
      if (!isPublicHttpAvatar(mainPhoto)) {
        throw new Error(
          'Could not upload profile photo. Check your connection and try again.',
        );
      }
      const videoUrl =
        uploaded.videoUrl && isPublicHttpAvatar(uploaded.videoUrl)
          ? uploaded.videoUrl
          : '';

      const patch: User = {
        ...user,
        name: input.name.trim(),
        country: input.country.trim(),
        photoUrl: mainPhoto,
        photoUrls: [mainPhoto],
        videoUrl: videoUrl || undefined,
        avatarUrl: mainPhoto,
        hostId,
        hostStatus: 'pending',
        applicationSubmittedAt: Date.now(),
        isVerified: false,
        isOnline: false,
        rejectionReason: undefined,
        docsRequested: undefined,
        bio,
        languages,
        categories,
        callPrice,
        idDocumentUrl: uploaded.idDocumentUrl,
        selfieUrl: uploaded.selfieUrl,
      };

      onStage?.('done');
      if (usingFirebase) {
        try {
          // Prefer compact avatar for RTDB; avoid huge multi-photo payloads
          const mainPhoto = patch.avatarUrl;
          await withTimeout(
            submitHostApplicationToFirebase(user.id, {
              name: patch.name,
              country: patch.country!,
              photoUrl: mainPhoto,
              photoUrls: [mainPhoto],
              videoUrl: '',
              hostId,
              bio: patch.bio,
              languages: patch.languages,
              categories: patch.categories,
              callPrice: patch.callPrice,
            }),
            12_000,
            'Saving profile',
          );
        } catch (fbErr) {
          // Still mark pending locally so host isn't stuck on the form
          console.warn('Firebase save failed, keeping local pending state', fbErr);
        }
        setUser(patch);
        void saveHostSession(patch, true);
        return;
      }

      setAuthUser(patch);
    },
    [setAuthUser, user, usingFirebase],
  );

  const approveCurrentHost = useCallback(async () => {
    if (!__DEV__) {
      throw new Error('Self-approve is disabled. Wait for admin approval.');
    }
    if (!user) throw new Error('Please sign in first.');
    if (usingFirebase) {
      await approveHostInFirebase(user.id);
      setUser((u) =>
        u
          ? {
              ...u,
              hostStatus: 'approved',
              isVerified: true,
              coinBalance: Math.max(u.coinBalance, 200),
            }
          : u,
      );
      return;
    }
    setAuthUser({
      ...user,
      hostStatus: 'approved',
      isVerified: true,
      coinBalance: Math.max(user.coinBalance, 200),
      isOnline: false,
    });
  }, [setAuthUser, user, usingFirebase]);

  const saveHostProfile = useCallback(
    async (
      input: {
        name: string;
        bio: string;
        country?: string;
        photoUrls: string[];
        videoUrl?: string;
        languages?: string[];
        categories?: string[];
      },
      onStage?: (stage: string) => void,
    ) => {
      if (!user) throw new Error('Please sign in first.');
      if (!input.name.trim()) throw new Error('Display name is required.');
      if (!input.photoUrls?.length) {
        throw new Error('Add at least one profile photo.');
      }

      onStage?.('photos');
      const uploaded = await withTimeout(
        uploadHostApplicationMedia(
          {
            hostUid: user.id,
            photoUris: input.photoUrls.slice(0, 6),
            videoUri: input.videoUrl?.trim() || undefined,
          },
          (stage) => onStage?.(stage),
        ),
        90_000,
        'Uploading media',
      );

      let photos = uploaded.photoUrls.filter(Boolean);
      if (!photos.length) photos = input.photoUrls.slice(0, 1);
      // Promote ALL photos to public https — never persist file:/blob:/data:
      const publishedPhotos: string[] = [];
      for (const photo of photos) {
        if (isPublicHttpAvatar(photo)) {
          publishedPhotos.push(photo);
          continue;
        }
        const published = await ensurePublicAvatarUrl(user.id, photo);
        if (published && isPublicHttpAvatar(published)) {
          publishedPhotos.push(published);
        }
      }
      if (!publishedPhotos.length) {
        throw new Error(
          'Could not upload profile photo. Check your connection and try again.',
        );
      }
      const mainPhoto = publishedPhotos[0]!;
      photos = publishedPhotos;
      const videoUrl =
        uploaded.videoUrl && isPublicHttpAvatar(uploaded.videoUrl)
          ? uploaded.videoUrl
          : input.videoUrl?.trim() && isPublicHttpAvatar(input.videoUrl.trim())
            ? input.videoUrl.trim()
            : user.videoUrl && isPublicHttpAvatar(user.videoUrl)
              ? user.videoUrl
              : '';

      const callPrice =
        user.callPrice || callPriceForLevel(user.level || 1);

      const patch: User = {
        ...user,
        name: input.name.trim(),
        bio: input.bio.trim() || `${input.name.trim()} · CoinCall host`,
        country: (input.country || user.country || '').trim() || user.country,
        photoUrl: mainPhoto,
        photoUrls: photos,
        avatarUrl: mainPhoto,
        videoUrl: videoUrl || undefined,
        callPrice,
        languages: input.languages?.length
          ? input.languages
          : user.languages || ['English'],
        categories: input.categories?.length
          ? input.categories
          : user.categories || ['Talk'],
      };

      onStage?.('done');
      if (usingFirebase) {
        await updateHostProfileInFirebase(user.id, {
          name: patch.name,
          bio: patch.bio,
          country: patch.country,
          photoUrl: mainPhoto,
          photoUrls: photos,
          videoUrl: isPublicHttpAvatar(videoUrl) ? videoUrl : '',
          languages: patch.languages,
          categories: patch.categories,
        }).catch((e) => {
          console.warn('Profile Firebase sync failed', e);
        });
      }

      // Central API (+ Mongo when configured) so Luma sees the same DP/bio/rate
      try {
        await syncHostProfileToApi(user.id, {
          name: patch.name,
          bio: patch.bio || '',
          country: patch.country,
          photoUrl: mainPhoto,
          photoUrls: photos,
          videoUrl: isPublicHttpAvatar(videoUrl) ? videoUrl : undefined,
          languages: patch.languages,
          categories: patch.categories,
          callPrice,
        });
      } catch (e) {
        console.warn('Profile API sync failed', e);
      }

      setAuthUser(patch);
      return patch;
    },
    [setAuthUser, user, usingFirebase],
  );

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: user !== null,
      isHostApproved:
        user?.hostStatus === 'approved' &&
        !user?.banned &&
        !user?.suspended &&
        user.hostStatus !== 'banned' &&
        user.hostStatus !== 'suspended',
      usingFirebase,
      authReady,
      signIn,
      signUp,
      signOut,
      setAuthUser,
      submitHostApplication,
      approveCurrentHost,
      sendLoginOtp,
      sendPasswordReset,
      saveHostProfile,
    }),
    [
      user,
      usingFirebase,
      authReady,
      signIn,
      signUp,
      signOut,
      setAuthUser,
      submitHostApplication,
      approveCurrentHost,
      sendLoginOtp,
      sendPasswordReset,
      saveHostProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider.');
  return context;
}
