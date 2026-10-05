/**
 * DriverGeometry — what the camera needs of whatever a focus drives it toward,
 * carried on the `SelectionRow` by the arm's own `extractRow`. It rides the row
 * (not a resolver threaded through the call sites) so the focus-generic camera
 * readers — drivers, approach tilt, framing, halo, pivot — stay pure functions
 * of the row and never resolve a focus id against a body table.
 */
export type DriverGeometry = {
  /**
   * `deriveBodyStates` key — a `SlabHostId` where a slab row names one. Null
   * when the focus has no table row to pose from (a survey star), which is what
   * every "does this focus drive the camera's target" gate reads.
   */
  readonly poseId: string | null;
  /** Pivot floor for a groundless driver: a mesh hull, a hole's horizon. */
  readonly boundingRadiusM: number;
  /** Framing distance, halo radius, approach distance. */
  readonly footprintRadiusM: number;
  /** Null = no surface to taper against (mesh bodies). */
  readonly groundRadiusM: number | null;
  readonly standoffRadii: number;
  /** Fixed radius multiple to arrive at, overriding the screen-fill distance. */
  readonly focusDistanceRadii?: number;
};
