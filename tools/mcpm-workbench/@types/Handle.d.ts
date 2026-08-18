import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { GizmoHandleId } from './GizmoHandleId';

/** A translate or resize handle: a single point at `positionMpc`, dragged along `axisDir` (its
 *  world-space unit axis direction — see `applyTranslateDrag`/`applyResizeDrag`, F1.3).
 *  For resize handles, `axisDir` is ALWAYS the raw +axis unit vector regardless of the handle's
 *  `sign` — the sign travels separately in `GizmoHandleId` and is applied by the drag math, never
 *  baked into `axisDir` (double-encoding it would flip `applyResizeDrag`'s face-anchoring). */
export type Handle = {
  readonly id: GizmoHandleId;
  readonly positionMpc: Vec3;
  readonly axisDir: Vec3;
};
