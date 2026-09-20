import type { PathSample } from './PathSample';

/**
 * PathTrack — one `flyPath` flattened to an evaluable window.
 *
 * Unlike `BaseSegment`/`VelRamp`/`OscTrack`, a path cannot be a per-channel
 * scalar track: a Catmull-Rom needs neighbouring waypoints (not a `from→to`)
 * and its arc-length reparametrisation COUPLES the four channels through one
 * shared path parameter. So a path is a single composite writer that supersedes
 * the base layer for `target`/`distance`/`yaw`/`pitch` over `[startSec, endSec)`
 * (velocity and oscillation layers still add on top).
 *
 * `sample(localSec)` is a closure bound at compile time over the precomputed
 * geometry (arc-length table), timing curve, and global ease — `compileClip`
 * does all the spline math once, the per-frame evaluator just calls it.
 * Carrying a function is intentional and specific to this artifact: a
 * `CompiledClip` lives only in the in-memory compile cache (a `WeakMap`); it is
 * never serialised, unlike the plain-data `ClipData`/`Effect` authoring forms.
 */
export type PathTrack = {
  readonly startSec: number;
  readonly endSec: number;
  /** `localSec` is seconds since the path's own `startSec` (0 → `endSec−startSec`). */
  readonly sample: (localSec: number) => PathSample;
};
