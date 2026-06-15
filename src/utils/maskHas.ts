/**
 * True if the 32-bit source-visibility `mask` has the bit for `source` set.
 *
 * The renderer queries this for every point, every frame — at ~10 million
 * points × 60 fps that's 600 M lookups per second. A 32-bit integer mask
 * answers in one `AND` and one compare; a JS `Set` would allocate and
 * dereference, which is unthinkable in a render loop and impossible inside
 * a WGSL shader. 32 bits gives 32 possible sources — far more than the
 * handful currently tracked.
 */

import type { SourceType } from '../@types/data/SourceType';

export function maskHas(mask: number, source: SourceType): boolean {
  return (mask & (1 << source)) !== 0;
}
