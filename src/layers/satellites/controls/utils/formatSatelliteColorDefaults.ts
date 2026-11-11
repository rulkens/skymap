/**
 * The satellite groups a DebugPanel session recoloured, as whole `SATELLITE_PROFILES` rows ready
 * to paste over the table's own. A row counts as changed by its sRGB hex, the picker's resolution,
 * so re-picking the default leaves it out; the picker's long float tails print as 4 decimals.
 */
import type { SatelliteColors } from '../../@types/SatelliteColors';
import { SATELLITE_PROFILES } from '../../points/data/satelliteProfiles';
import { linearRgbToHex } from '../../../../utils/color/linearRgbToHex';

const SCALE = 10 ** 4;

const round = (c: number): number => Math.round(c * SCALE) / SCALE;

export function formatSatelliteColorDefaults(colors: SatelliteColors): string {
  return SATELLITE_PROFILES.filter(
    ({ id, color }) => linearRgbToHex(colors[id]) !== linearRgbToHex(color),
  )
    .map(({ id, label, areaM2, glintGain }) => {
      const [r, g, b] = colors[id].map(round);
      return `{ id: '${id}', label: '${label}', color: [${r}, ${g}, ${b}], areaM2: ${areaM2}, glintGain: ${glintGain} },`;
    })
    .join('\n');
}
