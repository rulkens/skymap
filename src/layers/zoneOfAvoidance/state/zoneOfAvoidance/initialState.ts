/**
 * The galactic-plane dust band is meant to be visible from first paint,
 * explaining the catalog thin-out near b=0 rather than leaving it looking
 * like a data gap, so the layer boots enabled with `DEFAULT_ZONE_OF_AVOIDANCE_TUNING`
 * (see `../defaults` for the tuning-knob rationale).
 */

import { DEFAULT_ZONE_OF_AVOIDANCE_TUNING } from '../defaults';
import type { ZoneOfAvoidanceSettings } from '../../../../@types/settings/ZoneOfAvoidanceSettings';

export const initialState: ZoneOfAvoidanceSettings = {
  enabled: true,
  ...DEFAULT_ZONE_OF_AVOIDANCE_TUNING,
};
