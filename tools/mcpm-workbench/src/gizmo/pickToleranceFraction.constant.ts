/** World-space pick tolerance, as a fraction of min(halfExtentMpc) — sized off the box itself,
 *  not screen-space-constant. Resize handles only; translate arrows rebase onto their own
 *  arrowLengthMpc (see pickGizmoHandle.ts) since they hold a constant screen size instead. */
export const PICK_TOLERANCE_FRACTION = 0.05;
