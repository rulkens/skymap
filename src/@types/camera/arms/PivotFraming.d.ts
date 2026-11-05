/**
 * PivotFraming — everything the zoom/orbit lane needs about the camera's
 * current pivot, in one bundle. `radiusMpc` and `floorMpc` diverge on purpose:
 * `zoomedDistance`'s taper anchors on the RAW radius (`h = distance -
 * radiusMpc`), while `clampDistance`'s floor is the standoff-and-MIN-adjusted
 * value — collapsing them into one number would lose the taper anchor.
 */

export type PivotFraming = {
  /** Physical radius of the pivot body in Mpc; null when the pivot has no surface. */
  readonly radiusMpc: number | null;
  /** Camera distance floor in Mpc — standoff already applied, MIN clamp already applied. */
  readonly floorMpc: number;
};
