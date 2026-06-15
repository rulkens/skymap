/**
 * Returns a new 32-bit source-visibility mask with the bit for `source`
 * set (idempotent).  Companion to `maskHas` / `maskWithout` — see
 * `maskHas` for why visibility is a bitmask rather than a `Set`.
 */

import type { SourceType } from '../@types/data/SourceType';

export function maskWith(mask: number, source: SourceType): number {
  return mask | (1 << source);
}
