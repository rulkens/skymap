/** Boot values of the field's live knobs, read off the calibration row the tool shares. */
import type { MilkyWayFieldTuning } from '../../@types/MilkyWayFieldTuning';
import { FIELD_CALIBRATION } from './fieldCalibration';

export const MILKY_WAY_FIELD_TUNING_DEFAULTS: MilkyWayFieldTuning = {
  exposure: FIELD_CALIBRATION.exposure,
  dust: true,
  // A copy: the store deep-freezes its initial state, and the tool's row stays its own.
  divisors: { ...FIELD_CALIBRATION.divisors },
};
