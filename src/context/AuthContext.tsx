import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { User } from '../types/user';

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

type AuthContextValue = {
  user: User | null;
  isAuthenticated: boolean;
  signIn: (input: SignInInput) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function createMockUser(partial: Omit<User, 'id' | 'role' | 'coinBalance' | 'isVerified'> & Partial<User>): User {
  return {
    id: `user_${Date.now()}`,
    role: 'user',
    coinBalance: 100,
    isVerified: false,
    ...partial,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const signIn = useCallback(async (input: SignInInput) => {
    if (input.method === 'email') {
      if (!input.email?.trim() || !input.password?.trim()) {
        throw new Error('Email and password are required.');
      }
      setUser(
        createMockUser({
          name: input.email.split('@')[0] || 'User',
          email: input.email.trim(),
        }),
      );
      return;
    }

    if (!input.phone?.trim() || !input.otp?.trim()) {
      throw new Error('Phone and OTP are required.');
    }
    if (input.otp.trim().length < 4) {
      throw new Error('Enter a valid OTP (any 4+ digits for mock login).');
    }

    setUser(
      createMockUser({
        name: `User ${input.phone.slice(-4)}`,
        phone: input.phone.trim(),
      }),
    );
  }, []);

  const signUp = useCallback(async (input: SignUpInput) => {
    if (!input.name.trim()) {
      throw new Error('Name is required.');
    }
    if (!input.isAgeVerified) {
      throw new Error('You must confirm you are 18 or older.');
    }

    if (input.method === 'email') {
      if (!input.email?.trim() || !input.password?.trim()) {
        throw new Error('Email and password are required.');
      }
      if (input.password.length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }
      setUser(
        createMockUser({
          name: input.name.trim(),
          email: input.email.trim(),
        }),
      );
      return;
    }

    if (!input.phone?.trim()) {
      throw new Error('Phone number is required.');
    }

    setUser(
      createMockUser({
        name: input.name.trim(),
        phone: input.phone.trim(),
      }),
    );
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: user !== null,
      signIn,
      signUp,
      signOut,
    }),
    [user, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return context;
}
