/**
 * `enabled` is a plain literal — the galactic disk is part of the baseline
 * scene; `labelEnabled` is a plain `true` too (no separate label-visible
 * field exists). The tuning knobs spread in from `MILKY_WAY_TUNING_DEFAULTS`,
 * the renderer calibration module's own source of truth for where the
 * star-cloud look starts.
 */

import { MILKY_WAY_TUNING_DEFAULTS } from '../../../../services/engine/galaxyGenerator/v1/milkyWayCalibration';
import type { MilkyWaySettings } from '../../../../@types/settings/MilkyWaySettings';

export const initialState: MilkyWaySettings = {
  enabled: true,
  labelEnabled: true,
  ...MILKY_WAY_TUNING_DEFAULTS,
};
