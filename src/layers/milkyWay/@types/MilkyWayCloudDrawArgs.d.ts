/**
 * MilkyWayCloudDrawArgs — the per-frame draw payload for the Milky Way
 * point-cloud renderer's two billboard passes. `tuning` rides the payload
 * rather than being read off the calibration module directly, so a
 * DebugPanel slider drag lands on the very next frame with no imperative
 * setter. `MILKY_WAY_MODEL_SCALE` stays out — derived from the generation
 * preset's radius, so nothing can move it at runtime.
 */

import type { Vec2 } from '../../../@types/math/Vec2';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { MilkyWayCloudBuffers } from '../../../@types/galaxy/MilkyWayCloudBuffers';
import type { MilkyWayTuning } from '../../../@types/settings/MilkyWayTuning';

export type MilkyWayCloudDrawArgs = {
  /** Combined view-projection matrix (16 floats) — `ctx.vp`. */
  readonly vp: Float32Array;
  /** Target size in device pixels — the star pass gets `mw-aggregate`'s size,
   * not the canvas. Drives the star px clamp. */
  readonly viewportPx: Vec2;
  /**
   * Pixels per radian for THIS target — `ctx.drawPxPerRad` scaled by
   * `viewportPx[1] / canvasHeight` when the target is smaller than the canvas.
   */
  readonly pxPerRad: number;
  /**
   * The eye in the cloud's model space (`milkyWayCamPosModel(ctx.drawCamPos)`)
   * — each sprite builds its own eye-facing basis from it, so a blob looks the
   * same from every view of one rig rather than tilting per view plane.
   */
  readonly camPosModel: Vec3;
  /** Per-cloud world placement matrix (16 floats) — `milkyWayModelCached()`. */
  readonly model: Float32Array;
  /** Distance-fade × toggle-opacity, already composed, in [0, 1]. */
  readonly fadeAlpha: number;
  /** Live star-cloud look knobs — `state.settings.milkyWay`. */
  readonly tuning: MilkyWayTuning;
  /** The generation pass's current instance buffers + counts. */
  readonly buffers: MilkyWayCloudBuffers;
};
