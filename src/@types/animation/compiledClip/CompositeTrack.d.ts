import type { CompositeSample } from './CompositeSample';

/**
 * CompositeTrack — one effect that drives several channels through a single
 * shared parameter (a `flyPath`'s arc length), so it cannot split into
 * per-channel `BaseSegment`s. It supersedes the base layer for the `channels`
 * it declares from `startSec` on; velocity and oscillation layers still add on top.
 *
 * `sample` is a closure bound at compile time over the precomputed geometry,
 * so the per-frame evaluator only calls it. Carrying a function is safe because
 * a `CompiledClip` lives only in the in-memory compile cache, never serialised.
 */
export type CompositeTrack = {
  readonly startSec: number;
  readonly endSec: number;
  /** The channels `sample` writes, no more and no fewer. Roll is never one. */
  readonly channels: readonly (keyof CompositeSample)[];
  /** `localSec` is seconds since the track's own `startSec` (0 → `endSec−startSec`). */
  readonly sample: (localSec: number) => CompositeSample;
};
