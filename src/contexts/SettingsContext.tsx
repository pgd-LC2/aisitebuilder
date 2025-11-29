import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const PRELOAD_STORAGE_KEY = 'aisb:preload-node-modules';

interface SettingsContextValue {
  preloadNodeModules: boolean;
  setPreloadNodeModules: (value: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [preloadNodeModules, setPreloadNodeModulesState] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PRELOAD_STORAGE_KEY);
      if (stored !== null) {
        setPreloadNodeModulesState(stored === 'true');
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const setPreloadNodeModules = (value: boolean) => {
    setPreloadNodeModulesState(value);
    try {
      localStorage.setItem(PRELOAD_STORAGE_KEY, value ? 'true' : 'false');
    } catch {
      // ignore quota errors
    }
  };

  const value = useMemo(
    () => ({
      preloadNodeModules,
      setPreloadNodeModules
    }),
    [preloadNodeModules]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings 必须在 SettingsProvider 内部使用');
  }
  return ctx;
};
