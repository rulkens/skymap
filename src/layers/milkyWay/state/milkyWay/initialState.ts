/**
 * The disk and its label start on, drawn by the v1 cloud. Each knob group
 * starts from its module's own calibration defaults.
 */

import { MILKY_WAY_CLOUD_TUNING_DEFAULTS } from '../../../../services/engine/galaxyGenerator/v1/milkyWayCalibration';
import { MILKY_WAY_FIELD_TUNING_DEFAULTS } from '../../field/data/milkyWayFieldTuningDefaults';
import type { MilkyWaySettings } from '../../@types/MilkyWaySettings';

export const initialState: MilkyWaySettings = {
  enabled: true,
  labelEnabled: true,
  renderer: 'v1',
  cloud: { ...MILKY_WAY_CLOUD_TUNING_DEFAULTS },
  field: MILKY_WAY_FIELD_TUNING_DEFAULTS,
};
