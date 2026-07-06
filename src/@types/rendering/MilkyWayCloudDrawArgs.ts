/**
 * MilkyWayCloudDrawArgs — the per-frame draw payload for the Milky Way
 * point-cloud renderer's two billboard passes (additive stars +
 * multiplicative-transmittance dust).
 *
 * Every field the renderer needs to pack its shared uniform buffer, plus the
 * generated instance buffers to draw. The camera-derived values
 * (`vp`/`viewportPx`/`camRight`/`camUp`) and the per-cloud `model` matrix are
 * threaded in by the HDR-pass caller; the fixed calibration scalars
 * (exposure, model scale, star px clamp) are read by the renderer straight
 * from `milkyWayCalibration.ts`, so they are deliberately NOT part of this
 * payload — a visual-gate tuning pass touches the calibration module, not
 * every call site.
 *
 * `fadeAlpha` is the already-composed distance-fade × toggle-opacity scalar
 * (the pass composes it exactly as the old impostor did). At `fadeAlpha === 0`
 * the star pass adds no light and the dust pass collapses to the
 * multiplicative identity, so the cloud contributes nothing — the caller may
 * skip the `draw` entirely for honesty, but a zero-fade draw is a visual
 * no-op.
 */

import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';
import type { MilkyWayCloudBuffers } from '../galaxy/MilkyWayCloudBuffers';

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
  /** The generation pass's current instance buffers + counts. */
  readonly buffers: MilkyWayCloudBuffers;
};
