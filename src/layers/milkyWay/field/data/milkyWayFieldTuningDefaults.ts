/** Boot values of the field's live knobs, read off the calibration row the tool shares; `extras` is the tool's alone. */
import type { MilkyWayFieldTuning } from '../../@types/MilkyWayFieldTuning';
import { FIELD_CALIBRATION } from './fieldCalibration';

const { extras: _toolOnly, ...appDivisors } = FIELD_CALIBRATION.divisors;

export const MILKY_WAY_FIELD_TUNING_DEFAULTS: MilkyWayFieldTuning = {
  exposure: FIELD_CALIBRATION.exposure,
  dust: true,
  divisors: appDivisors,
};
