import { createContext, useContext } from 'react';
import type { ThemeChoice } from '../theme/theme';

export type UISettings = {
  locale: string;
  setLocale: (locale: string) => void;
  theme: ThemeChoice;
  setTheme: (choice: ThemeChoice) => void;
  logout: () => Promise<void>;
  tokenRotated: (token: string) => void;
};

export const UISettingsContext = createContext<UISettings | null>(null);

export function useUISettings(): UISettings {
  const ctx = useContext(UISettingsContext);
  if (!ctx) {
    throw new Error('useUISettings must be used within a UISettingsContext.Provider');
  }
  return ctx;
}
