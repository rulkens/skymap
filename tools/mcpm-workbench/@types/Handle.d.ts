import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { GizmoHandleId } from './GizmoHandleId';

/** A translate or resize handle: a single point at `positionMpc`, dragged along `axisDir` (its
 *  world-space unit axis direction — see `applyTranslateDrag`/`applyResizeDrag`, F1.3). */
export type Handle = {
  readonly id: GizmoHandleId;
  readonly positionMpc: Vec3;
  readonly axisDir: Vec3;
};
