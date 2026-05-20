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

import { SURVEY_SOURCES, Source } from '../data/sources';

/**
 * "Show every survey" mask — `1` in every `SURVEY_SOURCES` bit position.
 * Equals `0b100011111` (bits 5/6/7 stay clear; those are POI codes).
 * The *startup* visibility mask is a separate constant in `defaults.ts`.
 */
export const ALL_VISIBLE_MASK: number = SURVEY_SOURCES.reduce<number>(
  (mask, src) => mask | (1 << src),
  0,
);

/** True if `mask` has the bit for `source` set. */
export function maskHas(mask: number, source: Source): boolean {
  return (mask & (1 << source)) !== 0;
}

/** Returns a new mask with the bit for `source` set (idempotent). */
export function maskWith(mask: number, source: Source): number {
  return mask | (1 << source);
}

/** Returns a new mask with the bit for `source` cleared (idempotent). */
export function maskWithout(mask: number, source: Source): number {
  // `~(1 << source)` flips every bit *except* the one we want to clear,
  // so AND-ing leaves all other bits untouched while zeroing this one.
  return mask & ~(1 << source);
}
