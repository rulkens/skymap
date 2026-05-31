/**
 * buildTimingSlotMap — turn an ordered list of timed-pass names into the
 * slot→(beginIdx, endIdx) table the `gpuTimingService` writes into a
 * `GPUQuerySet`.
 *
 * ### Why this is a function, not a static const
 *
 * The set of timed passes is no longer compile-time-fixed: it's DERIVED
 * from the render-pass registry (`TIMED_SLOT_NAMES` in
 * `services/engine/frame/passes/index.ts`).  Adding a renderer to
 * `HDR_PASSES` is the only edit needed — its timing slot is allocated
 * here automatically, and it appears in the DebugPanel without touching
 * any timing-layer file.  Keeping the allocation *mechanism* here (a
 * pure `gpu/timing` helper) while the *policy* — which passes, in what
 * order — lives in the engine/frame layer respects the one-way
 * `gpu` ⊥ `engine` dependency: this module never imports the registry,
 * it's handed the names.
 *
 * ### Index assignment
 *
 * Each name `i` gets the contiguous `GPUQuerySet` index pair
 * `[2i, 2i+1]` (beginning-of-pass / end-of-pass write indices).  The
 * pairing is internal and arbitrary — the only invariant is that the
 * service's `descriptorFor` and `decodeTimestampBuffer` agree on it,
 * which they do by sharing the one map this function returns.  The query
 * set is sized `names.length * 2` by the caller.
 *
 * Names are assumed unique (render-pass names are unique by
 * construction); a duplicate would collide on its index pair, so the
 * caller's registry is the place that guarantees uniqueness.
 */

export function buildTimingSlotMap(
  names: readonly string[],
): ReadonlyMap<string, readonly [number, number]> {
  const map = new Map<string, readonly [number, number]>();
  for (let i = 0; i < names.length; i++) {
    map.set(names[i]!, [i * 2, i * 2 + 1]);
  }
  return map;
}
