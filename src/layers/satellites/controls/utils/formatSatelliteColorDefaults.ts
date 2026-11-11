/**
 * The colours a DebugPanel session moved, as paste-ready `id: [r, g, b]` object-literal rows.
 * Ids are always quoted because `starlink-v1` is a syntax error bare. Rounded to 4 decimals, and
 * compared after rounding: the picker's hex round trip leaves long float tails that are no change.
 */
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { SatelliteColors } from '../../@types/SatelliteColors';
import type { SatelliteProfileId } from '../../points/@types/SatelliteProfileId';

const SCALE = 10 ** 4;

const formatColor = (color: Vec3): string =>
  `[${color.map((c) => Math.round(c * SCALE) / SCALE).join(', ')}]`;

export function formatSatelliteColorDefaults(
  colors: SatelliteColors,
  defaults: SatelliteColors,
): string {
  const lines: string[] = [];
  for (const id of Object.keys(defaults) as SatelliteProfileId[]) {
    const color = formatColor(colors[id]);
    if (color !== formatColor(defaults[id])) lines.push(`  '${id}': ${color},`);
  }
  return lines.join('\n');
}
