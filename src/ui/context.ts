import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { AppData } from '../app/state';

export interface UiApi {
  toast(message: string, kind?: 'info' | 'error'): void;
  navigate(route: string): void;
}

export const AppContext = createContext<(AppData & UiApi) | null>(null);

export function useApp(): AppData & UiApi {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppContext.Provider>');
  return ctx;
}
