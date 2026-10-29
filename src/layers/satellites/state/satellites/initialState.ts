/**
 * On by default: the Layer costs nothing until the camera nears Earth, and nothing is fetched or
 * propagated before then (spec §5.5).
 */
import type { SatellitesSettings } from '../../../../@types/settings/SatellitesSettings';

export const initialState: SatellitesSettings = {
  enabled: true,
};
