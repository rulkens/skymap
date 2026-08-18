import { createContext, useContext } from 'react';
import type { Store } from '../../@types/Store';
import type { AppState } from '../../@types/AppState';

/**
 * storeContext — makes the single app Store available to the React tree.
 * App creates the store once; ControlsPanel/Hud/GridBoxPanel read it via
 * `useAppStore()` + `useStore`. Viewport receives the same instance as a
 * prop, since it lives partly outside React (the RAF loop). Mirrors
 * `tools/flow-workbench/src/ui/storeContext.ts`.
 */
export const StoreContext = createContext<Store<AppState> | null>(null);

export function useAppStore(): Store<AppState> {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useAppStore must be used within a StoreContext provider');
  return store;
}
