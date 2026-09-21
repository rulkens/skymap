/**
 * DOME_PARAMS — the dome rig's tunable constants, named here so a later
 * change (a different theatre's tilt, a view-slot table shuffle) is a
 * one-line edit rather than a hunt through `domeBasis`/`domeFaceRotations`
 * call sites.
 */
export const DOME_PARAMS = {
  /** Zenith = camera forward pitched up by this many degrees. */
  tiltDeg: 60,
  /** Five face slots start here (19…23), after the capture rows' 1…18. */
  viewSlotBase: 19,
} as const;
