/**
 * SlabView — what a content layer's `draw` sees of its resolved slab.
 *
 * A `render` frame step names its slab by index (see `FrameStep`); resolving
 * that index into an actual view-projection matrix, camera position, and
 * viewport size is a lookup the executor performs exactly once per render
 * step, before invoking any layer in the step's group. Threading the
 * resolved `SlabView` into every layer's `draw` call — rather than handing
 * layers the raw `Slab` and a `ctx` to re-derive from — means layers never
 * do their own slab lookup, and the per-pass `ctx.vp as Float32Array` casts
 * that existed before this model retire along with it.
 *
 * `slab`, `vp`, `camPos`, and `viewportPx` are all `readonly`: a `SlabView`
 * is built fresh once per render step and handed to every layer in that
 * step's group, so nothing downstream should be able to mutate the shared
 * value out from under a sibling layer.
 */

import type { Slab } from './Slab';
import type { Vec2 } from '../../math/Vec2';
import type { Vec3 } from '../../math/Vec3';

export type SlabView = {
  /** The resolved slab — near/far, frame, precision — for the rare layer that cares. */
  readonly slab: Slab;
  /** This slab's proj·view, already narrowed to f32 for upload. */
  readonly vp: Float32Array;
  /** Slab-appropriate camera position (origin-relative for near slabs). */
  readonly camPos: Vec3;
  /** Backing-store-pixel viewport size for this slab's draw. */
  readonly viewportPx: Vec2;
};
