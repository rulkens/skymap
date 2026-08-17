/**
 * milkyWayModelCached — the Milky Way cloud's world placement, built once and
 * shared by every layer that draws the cloud. The placement never changes
 * (fixed galactic orientation + scale + the Sgr A* centre offset), so
 * re-deriving `milkyWayModelMatrix`'s twelve products per draw is pure waste;
 * a memo local to one draw layer would be silently rebuilt by the sibling
 * layer that also needs it.
 *
 * Returns the SAME `Float32Array` on every call — callers upload it, must not
 * mutate it.
 */
import { milkyWayModelMatrix } from './milkyWayModelMatrix';

let cached: Float32Array | null = null;

export function milkyWayModelCached(): Float32Array {
  cached ??= milkyWayModelMatrix();
  return cached;
}
