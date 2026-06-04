/**
 * storeContext — makes the single app Store available to the React tree.
 *
 * The store is created once in App and provided here; presentational panels read
 * it via `useAppStore()` + the `useStore` hook. The engine receives the same
 * store instance directly (as a Viewport prop) since it lives outside React.
 * One store, two consumers, no prop-drilling through the overlay components.
 */
import { createContext, useContext } from 'react';
import type { Store } from '../../@types/state/Store';
import type { AppState } from '../../@types/state/AppState';

export const StoreContext = createContext<Store<AppState> | null>(null);

export function useAppStore(): Store<AppState> {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useAppStore must be used within a StoreContext provider');
  return store;
}
