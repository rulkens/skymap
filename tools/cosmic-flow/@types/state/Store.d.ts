/**
 * Store — the minimal external-store contract the cosmic-flow tool builds on.
 *
 * Why this shape: it is exactly the surface React's `useSyncExternalStore`
 * needs (`subscribe` + a snapshot getter) plus a writer (`setState`). Keeping
 * it framework-agnostic means the engine can read state with a plain
 * `getSnapshot()` every frame while React components subscribe through the same
 * store — no separate event bus, no Redux. `setState` takes an updater function
 * (not a value) so the store can compare the result against the previous
 * snapshot by reference and skip notifying listeners on a no-op write.
 *
 * Snapshots are handed out as `Readonly<S>`: callers read, slice reducers
 * produce new state, nobody mutates in place.
 */
export type Store<S> = {
  getSnapshot(): Readonly<S>;
  subscribe(listener: () => void): () => void;
  setState(update: (prev: Readonly<S>) => Readonly<S>): void;
};
