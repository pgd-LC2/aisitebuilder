import { useContext } from 'react';
import { SettingsContext } from '../contexts/SettingsContext';

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings 必须在 SettingsProvider 内部使用');
  }
  return ctx;
};
