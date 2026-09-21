/**
 * `enabled` is derived from the SOURCE_REGISTRY milkyWay row's `visible`
 * gate; `labelEnabled` is a plain `true` (the row carries no separate
 * label-visible field). The tuning knobs spread in from
 * `MILKY_WAY_TUNING_DEFAULTS`, the renderer calibration module's own
 * source of truth for where the star-cloud look starts.
 */

import { Source, SOURCE_REGISTRY } from '../../../../data/sources';
import { MILKY_WAY_TUNING_DEFAULTS } from '../../../../services/engine/galaxyGenerator/v1/milkyWayCalibration';
import type { MilkyWaySettings } from '../../../../@types/settings/MilkyWaySettings';

export const initialState: MilkyWaySettings = {
  enabled: SOURCE_REGISTRY[Source.MilkyWay].visible,
  labelEnabled: true,
  ...MILKY_WAY_TUNING_DEFAULTS,
};
