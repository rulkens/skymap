import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { GizmoHandleId } from './GizmoHandleId';

/** A rotate handle: a ring of `radiusMpc` centered at `centerMpc`, normal = `axisDir`. F1 always
 *  builds these with `radiusMpc` 0 (`gizmoHandleGeometry.ts`) — real rings land in F2. */
export type RingHandle = {
  readonly id: GizmoHandleId;
  readonly centerMpc: Vec3;
  readonly axisDir: Vec3;
  readonly radiusMpc: number;
};
