import type { Channel } from '../Channel';
import type { Ease } from '../Ease';
import type { Space } from '../Space';
import type { PoseFrame } from '../../camera/PoseFrame';
import type { Vec3 } from '../../math/Vec3';

/**
 * BaseSegment — one `[startSec, endSec)` window on a channel's base layer.
 *
 * Two sub-kinds are distinguished by the `segKind` discriminant:
 *
 *   - `'tween'` (from `set` / `setVec`): move the channel TO `to` over the
 *     window. `to` is `number` for scalar channels, `Vec3` for `'target'`.
 *
 *   - `'spin'` (from `spin`): rotate the channel BY `to` (the `by` delta from
 *     the action) over the window. The `to` field stores the delta, NOT an
 *     absolute bearing — the evaluator adds it to the running pose rather than
 *     interpolating toward it.
 *
 * `from`, on either kind, is set only by `compileClip` on the first segment
 * after a composite: its final value. Absent, the evaluator starts the segment
 * from the prior segment's final value or the clip's `start` pose.
 *
 * `space` comes directly from the `set`/`spin` action (defaulting to
 * `CHANNEL_SPACE[ch]`). `ease` is also carried from the action.
 *
 * Segments in `baseTracks[channel]` are ordered by `startSec` ascending and
 * non-overlapping (guaranteed by `validateSingleWriter`, Task 5).
 */
export type BaseSegment = {
  readonly segKind: 'tween' | 'spin';
  readonly channel: Channel;
  readonly startSec: number;
  readonly endSec: number;
  readonly from?: number | Vec3;
  readonly to: number | Vec3;
  readonly ease: Ease;
  readonly space: Space;
  /** Carried from the `set`/`setVec` endpoint; absent ⇒ `'absolute'`. A `spin`
   *  is a relative writer and never carries one. */
  readonly frame?: PoseFrame;
  /** Only meaningful for `spin`-kind segments: when true, the spin repeats
   *  its `by`-delta sweep after `endSec` (the perpetual looping orbit idiom).
   *  The evaluator (Task 6) reads this to gate completion logic. */
  readonly loop?: boolean;
};
