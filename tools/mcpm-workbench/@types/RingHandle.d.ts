import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { GizmoHandleId } from './GizmoHandleId';

/** A rotate handle: a ring of `radiusMpc` centered at `centerMpc`, normal = `axisDir`
 *  (`gizmoHandleGeometry.ts`, F2.5's RING_RADIUS_ARROW_MULTIPLE · arrowLengthMpc). */
export type RingHandle = {
  readonly id: GizmoHandleId;
  readonly centerMpc: Vec3;
  readonly axisDir: Vec3;
  readonly radiusMpc: number;
};
