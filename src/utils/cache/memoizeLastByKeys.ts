/**
 * memoizeLastByKeys — single-slot memo for a keyed build: caches the last
 * `build()` result against `key`, recomputing only when a later `key` isn't
 * `Object.is`-equal element-for-element to the cached one (so a NaN-bearing
 * key still hits, unlike `===`). Each call site owns its own memo instance
 * (`hiiRegions.ts`'s two dust-CDF caches, `galaxyIsmMapArmForcing.ts`'s
 * forcing field) — sound under any interleaving since a key miss just
 * rebuilds, so a wrong hit can only cost performance, never correctness.
 */
export type LastByKeysMemo<T> = {
  get(key: readonly unknown[], build: () => T): T;
};

function sameKeys(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

export function memoizeLastByKeys<T>(): LastByKeysMemo<T> {
  let cached: { readonly key: readonly unknown[]; readonly value: T } | null = null;
  return {
    get(key: readonly unknown[], build: () => T): T {
      if (cached && sameKeys(cached.key, key)) return cached.value;
      const value = build();
      cached = { key, value };
      return value;
    },
  };
}
