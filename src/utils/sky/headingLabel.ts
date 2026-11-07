/** headingLabel — the compass readout, "180° · 34° up": whole degrees, a heading of 359.6° reads 0°. */

import { radToDeg } from '../math/radToDeg';

export function headingLabel(azimuthRad: number, altitudeRad: number): string {
  const azimuth = Math.round(radToDeg(azimuthRad)) % 360;
  const altitude = Math.round(radToDeg(altitudeRad));
  return `${azimuth}° · ${Math.abs(altitude)}° ${altitude < 0 ? 'down' : 'up'}`;
}
