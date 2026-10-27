import type { Channel } from '../Channel';
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
 * `S` lets a builder promise a narrower sample (a flyPath writes all four).
 */
export type CompositeTrack<S extends CompositeSample = CompositeSample> = {
  readonly startSec: number;
  readonly endSec: number;
  /** The channels `sample` writes, no more and no fewer. */
  readonly channels: readonly Channel[];
  /** `localSec` is seconds since the track's own `startSec` (0 → `endSec−startSec`). */
  readonly sample: (localSec: number) => S;
};
