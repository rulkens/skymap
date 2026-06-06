/**
 * createStore — a tiny external store: one snapshot + a listener set.
 *
 * Why hand-rolled instead of Redux/Zustand: the cosmic-flow tool needs exactly
 * two access patterns — React components subscribing via
 * `useSyncExternalStore`, and the engine reading the latest snapshot once per
 * frame with `getSnapshot()`. That is the whole contract, so a 30-line closure
 * beats a dependency.
 *
 * The load-bearing detail is the reference-equality gate in `setState`: an
 * updater that returns the SAME object (a no-op, e.g. clamping a value already
 * at its bound) must not notify listeners, or every such write would wake React
 * for nothing. Because slice reducers always return fresh objects on real
 * change and `prev` on no-op, `next !== prev` is a correct, cheap dirty check.
 *
 * `subscribe` returns its own unsubscribe so callers never need to hold the
 * listener reference to detach — the closure does.
 */
import type { Store } from '../../@types/state/Store';

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
      // Reference-equality gate: skip the notification on a no-op write.
      if (next === snapshot) return;
      snapshot = next;
      for (const listener of listeners) listener();
    },
  };
}
