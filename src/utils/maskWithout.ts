/**
 * Returns a new 32-bit source-visibility mask with the bit for `source`
 * cleared (idempotent).  Companion to `maskHas` / `maskWith` — see
 * `maskHas` for why visibility is a bitmask rather than a `Set`.
 */

import type { SourceType } from '../@types/data/SourceType';

export function maskWithout(mask: number, source: SourceType): number {
  // `~(1 << source)` flips every bit *except* the one we want to clear,
  // so AND-ing leaves all other bits untouched while zeroing this one.
  return mask & ~(1 << source);
}
