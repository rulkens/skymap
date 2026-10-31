import { SATELLITE_FOCUS_PREFIX } from './satelliteFocusPrefix';

/** encodeSatelliteFocusId — a satellite's deep-link focus id, the one spelling the URL and the palette share. */
export function encodeSatelliteFocusId(noradId: number): string {
  return `${SATELLITE_FOCUS_PREFIX}${noradId}`;
}
