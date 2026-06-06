/**
 * useStore — React binding for a cosmic-flow Store via useSyncExternalStore.
 *
 * It wires `store.subscribe` + a snapshot-deriving getter into React's
 * concurrent-safe external-store hook, so a component re-renders exactly when
 * its selected value changes.
 *
 * CAVEAT — getSnapshot must be referentially stable.
 *   React's `useSyncExternalStore` calls the getter on every render and bails
 *   into the "getSnapshot should be cached to avoid an infinite loop" error if
 *   the getter returns a NEW reference each time. So `useStore` is only safe
 *   with selectors that return a referentially-stable value:
 *     - a whole slice off the snapshot:  s => s.flow
 *     - a primitive field:               s => s.flow.mode
 *   Selectors that BUILD a fresh object/array/Set per call (e.g.
 *   selectEnabledLayers, selectFrameParams) will trip the guard. Those are
 *   deriving selectors meant for the engine's direct `getSnapshot()` reads each
 *   frame, NOT for useStore. Pass only stable selectors here.
 */
import { useSyncExternalStore } from 'react';
import type { Store } from '../../@types/state/Store';

export function useStore<S, T>(store: Store<S>, selector: (s: Readonly<S>) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getSnapshot()));
}
