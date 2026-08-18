import { useSyncExternalStore } from 'react';
import type { Store } from '../../@types/Store';

/**
 * useStore — React binding for a Store via useSyncExternalStore.
 *
 * CAVEAT: `selector` must return a referentially-stable value (a slice
 * off the snapshot, or a primitive field) — one that BUILDS a fresh
 * object/array per call trips React's "getSnapshot should be cached"
 * guard. Mirrors `tools/flow-workbench/src/state/useStore.ts`.
 */
export function useStore<S, T>(store: Store<S>, selector: (s: Readonly<S>) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getSnapshot()));
}
