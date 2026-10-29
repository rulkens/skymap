/**
 * Off by default; every class starts on, so switching the Layer on shows them all.
 */
import type { SatellitesSettings } from '../../../../@types/settings/SatellitesSettings';

export const initialState: SatellitesSettings = {
  enabled: false,
  items: {
    active: { enabled: true },
    debris: { enabled: true },
    other: { enabled: true },
  },
};
