/**
 * DriverGeometry — what the camera needs of whatever a focus drives it toward,
 * carried on the `SelectionRow` by the arm's own `extractRow`. It rides the row
 * (not a resolver threaded through the call sites) so the focus-generic camera
 * readers — drivers, approach tilt, framing, halo, pivot — stay pure functions
 * of the row and never resolve a focus id against a body table.
 */

import type { PositionedId } from '../../scene/PositionedId';
export type DriverGeometry = {
  /**
   * `deriveBodyStates` key — a `PositionedId` where a slab row names one. Null
   * when the focus has no table row to pose from (a survey star), which is what
   * every "does this focus drive the camera's target" gate reads.
   */
  readonly poseId: PositionedId | null;
  /** Pivot floor for a groundless driver: a mesh hull, a hole's horizon. */
  readonly boundingRadiusM: number;
  /** Framing distance, halo radius, approach distance. */
  readonly footprintRadiusM: number;
  /** Null = no surface to taper against (mesh bodies). */
  readonly groundRadiusM: number | null;
  readonly standoffRadii: number;
  /** Fixed radius multiple to arrive at, overriding the screen-fill distance. */
  readonly focusDistanceRadii?: number;
  /**
   * Core re-extracts this row every frame to place it under `poseId`
   * (`placeLiveSelection`): a transient object the sim clock moves though no body
   * table says so. Bodies leave it unset; `bodyFollowsSimClock` answers for them.
   */
  readonly followsSimClock?: true;
};
