import AsyncStorage from '@react-native-async-storage/async-storage';
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
  firebaseSignOut,
  listenAuth,
  submitHostApplicationToFirebase,
} from '../services/authService';
import { uploadHostApplicationMedia } from '../services/mediaUploadService';
import {
  confirmPhoneOtp,
  sendPhoneOtp,
} from '../services/phoneAuthService';
import type { User } from '../types/models';
import { Platform } from 'react-native';

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
  videoUrl: string;
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
  submitHostApplication: (input: HostApplicationInput) => Promise<void>;
  /** Dev-only helper — production hosts are approved from Admin panel */
  approveCurrentHost: () => Promise<void>;
  sendLoginOtp: (phone: string) => Promise<void>;
};

const STORAGE_KEY = 'coincall_host_user_v1';

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
    avatarUrl: `https://i.pravatar.cc/300?u=${encodeURIComponent(partial.name)}`,
    isOnline: false,
    hostStatus: 'none',
    ...partial,
    role: 'host',
  };
}

async function persistMock(user: User | null) {
  if (user) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  else await AsyncStorage.removeItem(STORAGE_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const usingFirebase = isFirebaseReady();

  useEffect(() => {
    if (usingFirebase) {
      const unsub = listenAuth((profile) => {
        setUser(profile);
        setAuthReady(true);
      });
      return unsub;
    }

    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && raw) {
          const parsed = JSON.parse(raw) as User;
          setUser({ ...parsed, hostStatus: parsed.hostStatus || 'none', role: 'host' });
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [usingFirebase]);

  const setAuthUser = useCallback((next: User | null) => {
    setUser(next);
    if (!usingFirebase) void persistMock(next);
  }, [usingFirebase]);

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
      return;
    }

    const next = createMockUser({
      name: input.email.split('@')[0] || 'Host',
      email: input.email.trim(),
      hostStatus: 'none',
    });
    setAuthUser(next);
  }, [setAuthUser, usingFirebase]);

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
    setAuthUser(null);
  }, [setAuthUser, usingFirebase]);

  const submitHostApplication = useCallback(
    async (input: HostApplicationInput) => {
      if (!user) throw new Error('Please sign in first.');
      if (!input.name.trim()) throw new Error('Display name is required.');
      if (!input.country.trim()) throw new Error('Country is required.');
      if (!input.photoUrls?.length) {
        throw new Error('Please add at least 1 photo.');
      }
      if (input.photoUrls.length < 2) {
        throw new Error('Please add at least 2 photos.');
      }
      if (!input.videoUrl) throw new Error('Please add an intro video.');

      const hostId = user.hostId || generateHostId();
      const photosLocal = input.photoUrls.slice(0, 8);

      const uploaded = await uploadHostApplicationMedia({
        hostUid: user.id,
        photoUris: photosLocal,
        videoUri: input.videoUrl,
      });
      const photos = uploaded.photoUrls;
      const videoUrl = uploaded.videoUrl;

      const patch: User = {
        ...user,
        name: input.name.trim(),
        country: input.country.trim(),
        photoUrl: photos[0],
        photoUrls: photos,
        videoUrl,
        avatarUrl: photos[0],
        hostId,
        hostStatus: 'pending',
        applicationSubmittedAt: Date.now(),
        isVerified: false,
        isOnline: false,
        rejectionReason: undefined,
      };

      if (usingFirebase) {
        await submitHostApplicationToFirebase(user.id, {
          name: patch.name,
          country: patch.country!,
          photoUrl: photos[0],
          photoUrls: photos,
          videoUrl,
          hostId,
        });
        setUser(patch);
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

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: user !== null,
      isHostApproved: user?.hostStatus === 'approved',
      usingFirebase,
      authReady,
      signIn,
      signUp,
      signOut,
      setAuthUser,
      submitHostApplication,
      approveCurrentHost,
      sendLoginOtp,
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
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider.');
  return context;
}
