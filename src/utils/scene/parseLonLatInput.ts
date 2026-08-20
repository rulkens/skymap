import type { LonLatDeg } from '../../@types/scene/LonLatDeg';

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
  const parts = text.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length !== 2) return null;

  const lonDeg = parseCoord(parts[0]!, 'E', 'W');
  const latDeg = parseCoord(parts[1]!, 'N', 'S');
  if (lonDeg === null || latDeg === null) return null;
  return { lonDeg, latDeg };
}

/** One `"12.53°E"`-style token → signed degrees, or null if not a number. */
function parseCoord(token: string, positiveLetter: string, negativeLetter: string): number | null {
  const stripped = token.replace('°', '');
  const letter = stripped.slice(-1).toUpperCase();
  const isPositive = letter === positiveLetter;
  const isNegative = letter === negativeLetter;
  const numeric = isPositive || isNegative ? stripped.slice(0, -1) : stripped;

  const value = Number(numeric);
  if (!Number.isFinite(value) || numeric.length === 0) return null;
  return isNegative ? -value : value;
}
