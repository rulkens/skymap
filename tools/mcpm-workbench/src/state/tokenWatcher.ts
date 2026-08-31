/**
 * createTokenWatcher — the compare-and-remember half of Viewport.tsx's four store-subscriber
 * token watchers (reset/clearTrace/export/scfd), factored out of hand-copied blocks. No
 * initial value means "never seen": the first `changed()` always fires, matching the file's
 * other last-seen sentinels (e.g. `lastVolpathKey = null`).
 */
export type TokenWatcher<T> = {
  /** True iff `next` differs from the last-seen value; either way, remembers it. */
  changed(next: T): boolean;
  /** Re-arms the remembered value to `next` without reporting a change. */
  sync(next: T): void;
};

export function createTokenWatcher<T>(initial?: T): TokenWatcher<T> {
  let last = initial;
  return {
    changed(next: T): boolean {
      const isChanged = next !== last;
      last = next;
      return isChanged;
    },
    sync(next: T): void {
      last = next;
    },
  };
}
