import type { Store } from '../../@types/Store';

/**
 * createStore — one snapshot + a listener set. React components subscribe
 * via `useSyncExternalStore`; Viewport's frame loop reads the latest
 * snapshot once per frame with `getSnapshot()`. Mirrors
 * `tools/flow-workbench/src/state/createStore.ts`.
 *
 * The reference-equality gate in `setState` is load-bearing: an updater
 * that returns the SAME object (a no-op) must not notify listeners, or a
 * clamped write-at-the-bound would wake every subscriber for nothing.
 * Slice reducers always return fresh objects on real change and `prev`
 * on no-op, so `next !== prev` is a correct, cheap dirty check.
 */
export function createStore<S>(initial: S): Store<S> {
  let snapshot: Readonly<S> = initial as Readonly<S>;
  const listeners = new Set<() => void>();

  return {
    getSnapshot(): Readonly<S> {
      return snapshot;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setState(update: (prev: Readonly<S>) => Readonly<S>): void {
      const next = update(snapshot);
      if (next === snapshot) return;
      snapshot = next;
      for (const listener of listeners) listener();
    },
  };
}
