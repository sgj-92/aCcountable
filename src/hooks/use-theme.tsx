import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { Colors, type Palette, type ThemeMode } from '@/constants/theme';

const STORAGE_KEY = 'appearance';
const DEFAULT_MODE: ThemeMode = 'dark';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  scheme: 'dark' | 'light';
}

const ThemeContext = createContext<ThemeState>({ mode: DEFAULT_MODE, setMode: () => {}, scheme: 'dark' });

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_MODE);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'dark' || v === 'light' || v === 'system') setModeState(v);
      })
      .catch(() => {});
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
  };

  const scheme = mode === 'system' ? (system === 'light' ? 'light' : 'dark') : mode;
  return <ThemeContext.Provider value={{ mode, setMode, scheme }}>{children}</ThemeContext.Provider>;
}

/** The active colour palette. */
export function useTheme(): Palette {
  return Colors[useContext(ThemeContext).scheme];
}

/** The Appearance setting and the resolved scheme. */
export function useThemeMode() {
  return useContext(ThemeContext);
}
