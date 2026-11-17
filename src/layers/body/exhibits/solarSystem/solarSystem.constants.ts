/** The Solar System exhibit's tuned values: the starfield trim and the pose. */

import { SCALE_UNITS } from '../../../../data/scaleUnits';
import type { CameraPose } from '../../../../@types/camera/pose/CameraPose';

/** Starfield exposure trim (1.0 is the shader baseline); held down so the thin conics read against the sky. */
export const STARFIELD_BRIGHTNESS = 0.3;

/** Far enough out that Neptune's 30 AU orbit clears the frame edge; `distance` itself is Mpc. */
const FRAMING_AU = 42;

/** About 34° above the ecliptic. POSITIVE: `pitch = asin(-forward.y)` and `-forward` points target to EYE. */
const ECLIPTIC_TILT_RAD = 0.6;

export const POSE: CameraPose = {
  target: [0, 0, 0],
  yaw: 0,
  pitch: ECLIPTIC_TILT_RAD,
  distance: FRAMING_AU * SCALE_UNITS.AU_TO_MPC,
};
