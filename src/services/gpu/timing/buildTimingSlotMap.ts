/**
 * buildTimingSlotMap — turn an ordered list of timed-pass names into the
 * slot→(beginIdx, endIdx) table the `gpuTimingService` writes into a
 * `GPUQuerySet`.
 *
 * ### Why this is a function, not a static const
 *
 * The set of timed passes is data-driven, not compile-time-fixed: it's DERIVED
 * from the FRAME program + content-layer registry (`TIMED_SLOTS` in
 * `services/engine/frame/frameProgram.ts`).  Adding a layer to the registry
 * is the only edit needed — its timing slot is allocated
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
 * Names MUST be unique — a duplicate would collide on its index pair, so
 * every pass sharing the name would overwrite the same two timestamps
 * (whichever pass resolves last "wins", silently). The caller's registry is
 * the place that guarantees uniqueness (`layerTimingSlotName` is what makes a
 * body-row layer's name unique per row); this function enforces the
 * precondition rather than trusting it, since a collision here corrupts data
 * rather than throwing on its own.
 */

export function buildTimingSlotMap(
  names: readonly string[],
): ReadonlyMap<string, readonly [number, number]> {
  const map = new Map<string, readonly [number, number]>();
  for (let i = 0; i < names.length; i++) {
    const name = names[i]!;
    if (map.has(name)) {
      throw new Error(`buildTimingSlotMap: duplicate timing slot name "${name}"`);
    }
    map.set(name, [i * 2, i * 2 + 1]);
  }
  return map;
}
