import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import {
  darkColors,
  lightColors,
  type AppColors,
  type ColorSchemeName,
} from './colors';

type ThemeContextValue = {
  scheme: ColorSchemeName;
  colors: AppColors;
  isDark: boolean;
  setScheme: (scheme: ColorSchemeName | 'system') => void;
  preference: ColorSchemeName | 'system';
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const STORAGE_KEY = 'coincall_theme_pref_v1';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreference] = useState<ColorSchemeName | 'system'>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && (raw === 'dark' || raw === 'light' || raw === 'system')) {
          setPreference(raw);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setScheme = useCallback((next: ColorSchemeName | 'system') => {
    setPreference(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const scheme: ColorSchemeName =
    preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;

  const value = useMemo(
    () => ({
      scheme,
      colors: scheme === 'light' ? lightColors : darkColors,
      isDark: scheme === 'dark',
      setScheme,
      preference,
    }),
    [preference, scheme, setScheme],
  );

  if (!ready) {
    return (
      <ThemeContext.Provider
        value={{
          scheme: 'dark',
          colors: darkColors,
          isDark: true,
          setScheme,
          preference: 'system',
        }}
      >
        {children}
      </ThemeContext.Provider>
    );
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
