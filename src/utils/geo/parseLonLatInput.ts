import type { LonLatDeg } from '../../@types/scene/LonLatDeg';
import { parseCompassDegrees } from './parseCompassDegrees';

/**
 * parseLonLatInput — lenient `"lon, lat"` text parse for the debug
 * fly-to-coordinates instrument. Accepts comma- or whitespace-separated
 * numbers, an optional `°` degree sign, and an optional trailing compass
 * letter (E/W for longitude, N/S for latitude — case-insensitive, W/S
 * negate). Returns `null` on anything that doesn't cleanly parse to exactly
 * two numbers — the panel's contract is to ignore unparseable input rather
 * than surface a validation error for a debug-only text box.
 */
export function parseLonLatInput(text: string): LonLatDeg | null {
  const parts = text
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length !== 2) return null;

  const lon = parseCompassDegrees(parts[0]!);
  const lat = parseCompassDegrees(parts[1]!);
  if (lon === null || lat === null || lon.axis === 'lat' || lat.axis === 'lon') return null;
  return { lonDeg: lon.deg, latDeg: lat.deg };
}
