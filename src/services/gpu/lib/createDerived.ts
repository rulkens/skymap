/**
 * createDerived — the value-returning, key-derived sibling of
 * `createKeyedRebuild`: instead of a dirty flag over a `void` build, it holds
 * a memoized `T` keyed on element-wise `Object.is`. No `invalidate` — the key
 * is re-read at every `get()`, so a node cannot go stale.
 */

import type { Derived } from '../../../@types/gpu/Derived';

export function createDerived<T>(spec: {
  readonly key: () => readonly unknown[];
  readonly compute: () => T;
}): Derived<T> {
  let lastKey: readonly unknown[] | undefined;
  let value: T;

  return {
    get(): T {
      const key = spec.key();
      if (lastKey === undefined || !sameKey(lastKey, key)) {
        lastKey = key;
        value = spec.compute();
      }
      return value;
    },
  };
}

function sameKey(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}
