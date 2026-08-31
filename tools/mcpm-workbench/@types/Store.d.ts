/**
 * Store — the minimal external-store contract the workbench builds on.
 *
 * Exactly the surface `useSyncExternalStore` needs (`subscribe` + a snapshot
 * getter) plus a writer. `setState` takes an updater (not a value) so
 * `createStore` can compare the result against the previous snapshot by
 * reference and skip notifying listeners on a no-op write. Mirrors
 * `tools/flow-workbench/@types/state/Store.d.ts`.
 */
export type Store<S> = {
  getSnapshot(): Readonly<S>;
  subscribe(listener: () => void): () => void;
  setState(update: (prev: Readonly<S>) => Readonly<S>): void;
};
