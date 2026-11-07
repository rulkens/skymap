/** sunAltitudeAt — the Sun's altitude (radians) at a spot; the Sun is the heliocentric origin. */

import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import { altAzFromSpot } from './altAzFromSpot';

export function sunAltitudeAt(spot: SkySpot, simDays: number): number {
  return altAzFromSpot(spot, [0, 0, 0], simDays).altitudeRad;
}
