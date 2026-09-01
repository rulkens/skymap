export type Derived<T> = {
  /**
   * The value for the CURRENT key. Recomputes iff the key tuple moved since the
   * last call; a node cannot go stale, because its key is re-read on every read.
   */
  get(): T;
};
