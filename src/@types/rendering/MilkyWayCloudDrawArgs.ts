/**
 * MilkyWayCloudDrawArgs — the per-frame draw payload for the Milky Way
 * point-cloud renderer's two billboard passes (additive stars +
 * multiplicative-transmittance dust).
 *
 * Every field the renderer needs to pack its shared uniform buffer, plus the
 * generated instance buffers to draw. The camera-derived values
 * (`vp`/`viewportPx`/`camRight`/`camUp`) and the per-cloud `model` matrix are
 * threaded in by the caller each frame, as is `tuning` — the live look knobs
 * off `settings.milkyWay`.
 *
 * `tuning` rides the payload rather than being read straight off the
 * calibration module because the DebugPanel's sliders write it live: a
 * module-level read would pin the boot values for the process's lifetime. The
 * layers already hold `state`, so threading it down the existing args struct
 * keeps the renderer a pure function of its arguments — no engine handle, no
 * imperative setter.
 *
 * `MILKY_WAY_MODEL_SCALE` stays out: it is derived from the generation preset's
 * radius, not a knob, so nothing can move it at runtime.
 *
 * `fadeAlpha` is the already-composed apparent-size-fade × toggle-opacity
 * scalar (`milkyWayLayer` composes it per frame). At `fadeAlpha === 0`
 * the star pass adds no light and the dust pass collapses to the
 * multiplicative identity, so the cloud contributes nothing — the caller may
 * skip the `draw` entirely for honesty, but a zero-fade draw is a visual
 * no-op.
 */

import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';
import type { MilkyWayCloudBuffers } from '../galaxy/MilkyWayCloudBuffers';
import type { MilkyWayTuning } from '../settings/MilkyWayTuning';

export type MilkyWayCloudDrawArgs = {
  /** Combined view-projection matrix (16 floats) — `ctx.vp`. */
  readonly vp: Float32Array;
  /** Canvas size in device pixels — `[width, height]`. Drives the star px clamp. */
  readonly viewportPx: Vec2;
  /** Camera-facing billboard right axis (world space) — `cameraBillboardBasis(ctx.cam)`. */
  readonly camRight: Vec3;
  /** Camera-facing billboard up axis (world space). */
  readonly camUp: Vec3;
  /** Per-cloud world placement matrix (16 floats) — `milkyWayModelMatrix()`. */
  readonly model: Float32Array;
  /** Distance-fade × toggle-opacity, already composed, in [0, 1]. */
  readonly fadeAlpha: number;
  /** Live star-cloud look knobs — `state.settings.milkyWay`. */
  readonly tuning: MilkyWayTuning;
  /** The generation pass's current instance buffers + counts. */
  readonly buffers: MilkyWayCloudBuffers;
};
