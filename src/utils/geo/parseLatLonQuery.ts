import type { LonLatDeg } from '../../@types/scene/LonLatDeg';
import { parseCompassDegrees } from './parseCompassDegrees';

/**
 * parseLatLonQuery — a place typed into the palette. Map order (lat, lon), the
 * way map sites print coordinates, unless a compass letter names a token's axis:
 * the letter wins in either order. Null for anything but two in-range coordinates.
 */
export function parseLatLonQuery(text: string): LonLatDeg | null {
  const parts = text
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length !== 2) return null;
  const first = parseCompassDegrees(parts[0]!);
  const second = parseCompassDegrees(parts[1]!);
  if (first === null || second === null) return null;
  if (first.axis !== null && first.axis === second.axis) return null;

  const latFirst =
    first.axis === 'lat' || second.axis === 'lon' || (first.axis === null && second.axis === null);
  const latDeg = latFirst ? first.deg : second.deg;
  const lonDeg = latFirst ? second.deg : first.deg;
  if (Math.abs(latDeg) > 90 || Math.abs(lonDeg) > 180) return null;
  return { latDeg, lonDeg };
}
