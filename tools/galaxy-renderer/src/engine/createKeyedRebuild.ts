/**
 * createKeyedRebuild — the gate for an expensive derived value that only some
 * frames want. It separates two axes an inline boolean expression tends to
 * braid: CONSUMER LIVENESS (`wanted`) and INPUTS MOVED (the dirty flag).
 *
 * Not a `Record<key, () => void>` reaction table, because a key-indexed table
 * can express neither a trigger with several keys nor a `wanted` reading two
 * different state slices, and it would lean on `Object.keys` order where real
 * write-then-read dependencies exist.
 */

import type { KeyedRebuild } from '../../@types/engine/KeyedRebuild';

export function createKeyedRebuild(deps: {
  readonly wanted: () => boolean;
  readonly build: () => void;
}): KeyedRebuild {
  let dirty = true;

  return {
    invalidate(): void {
      dirty = true;
    },
    ensureFresh(): boolean {
      // `wanted` is tested FIRST and its false path leaves `dirty` set, so an
      // invalidation raised while nothing wants the value is RETAINED and
      // builds when a consumer appears. Clearing the flag here instead —
      // which reads as harmless, since nothing was built — drops that
      // invalidation: move a slider with the overlay off, turn the overlay
      // on, and the stale value is what you see.
      if (!deps.wanted()) return false;
      if (dirty) {
        dirty = false;
        deps.build();
      }
      return true;
    },
  };
}
