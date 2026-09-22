/**
 * DOME_PARAMS — the dome rig's tunable constants, so a tilt or view-slot
 * change is a one-line edit here instead of a hunt through
 * `domeBasis`/`domeFaceRotations` call sites.
 */
export const DOME_PARAMS = {
  /** Zenith = camera forward pitched up this many degrees. */
  tiltDeg: 60,
  /** Five face slots start here (19…23), after the capture rows' 1…18. */
  viewSlotBase: 19,
} as const;
