/**
 * 32-bit visibility-mask helpers for the `Source` enum.
 *
 * The renderer asks "is source X currently visible?" for every point, every
 * frame — at ~10 million points × 60 fps that's 600 M lookups per second.
 * A 32-bit integer mask answers in one `AND` and one compare; a JS `Set`
 * would allocate and dereference, which is unthinkable inside a render loop
 * and impossible inside a WGSL shader. 32 bits gives 32 possible sources —
 * far more than the four currently tracked.
 */

import { SOURCE_REGISTRY, SURVEY_SOURCES, Source } from '../data/sources';
import type { SourceType } from '../@types/data/SourceType';

/**
 * Startup visibility mask — `1` for every survey source whose registry
 * entry has `visible: true`. Structure codes never participate (their bits
 * stay clear). Drives the engine's initial `drawMask`/`pickMask`.
 */
export const ALL_VISIBLE_MASK: number = SURVEY_SOURCES.reduce<number>(
  (mask, src) => (SOURCE_REGISTRY[src].visible ? mask | (1 << src) : mask),
  0,
);

/** True if `mask` has the bit for `source` set. */
export function maskHas(mask: number, source: SourceType): boolean {
  return (mask & (1 << source)) !== 0;
}

/** Returns a new mask with the bit for `source` set (idempotent). */
export function maskWith(mask: number, source: SourceType): number {
  return mask | (1 << source);
}

/** Returns a new mask with the bit for `source` cleared (idempotent). */
export function maskWithout(mask: number, source: SourceType): number {
  // `~(1 << source)` flips every bit *except* the one we want to clear,
  // so AND-ing leaves all other bits untouched while zeroing this one.
  return mask & ~(1 << source);
}
