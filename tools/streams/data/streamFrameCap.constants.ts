import { DEFAULT_FOV_Y_RAD } from '../../../src/services/engine/camera/framing/cameraFraming';
import { stellarStreamsVisibility } from '../../../src/layers/stellarStreams/visibility';
import { STELLAR_STREAM_FOCUS } from '../../../src/layers/stellarStreams/selection/data/stellarStreamFocus.constants';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

const SHOWN_AT_FOCUS = 0.95;
const { in: IN_BAND_MPC, out: OUT_BAND_MPC } = stellarStreamsVisibility[0].bands.streams;
const [OUT_FROM_MPC, OUT_TO_MPC] = OUT_BAND_MPC;

// Inverse of smoothstep 3t² − 2t³ at `1 − SHOWN_AT_FOCUS` (the out band falls as 1 − smoothstep).
const T_FULL_ON = 0.5 - Math.sin(Math.asin(1 - 2 * (1 - SHOWN_AT_FOCUS)) / 3);

/** Farthest the focus camera may sit from the Sun with the streams still drawn at ≥ 0.95. */
export const STREAM_FOCUS_MAX_SUN_DISTANCE_KPC =
  (OUT_FROM_MPC + T_FULL_ON * (OUT_TO_MPC - OUT_FROM_MPC)) / SCALE_UNITS.KPC_TO_MPC;

// The in band rises as smoothstep, so its 0.95 point is 1 − T_FULL_ON of the way up.
/** Nearest the focus camera may sit to the Sun with the streams still drawn at ≥ 0.95. */
export const STREAM_FOCUS_MIN_SUN_DISTANCE_KPC =
  (IN_BAND_MPC[0] + (1 - T_FULL_ON) * (IN_BAND_MPC[1] - IN_BAND_MPC[0])) / SCALE_UNITS.KPC_TO_MPC;

/** Arrival distance per unit frame radius: `arrivalFraming`'s `radius / (arrivalSize · tan(fovY/2))`. */
export const STREAM_FOCUS_DISTANCE_PER_RADIUS =
  1 / (STELLAR_STREAM_FOCUS.arrivalSize * Math.tan(DEFAULT_FOV_Y_RAD / 2));
