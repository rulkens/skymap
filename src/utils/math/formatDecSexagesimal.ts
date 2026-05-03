/**
 * Format a Declination value (decimal degrees) as a sexagesimal string.
 *
 * Declination is expressed in degrees-arcminutes-arcseconds with an explicit
 * sign (+ for northern hemisphere, − for southern). The output format is
 * `±DD°MM'SS.s"` (e.g. 1.396° → "+01°23'45.6\"").
 *
 * Intended for display in the hover / info-card UI alongside formatRaSexagesimal.
 */

import { decomposeSexagesimal, pad } from './_sexagesimal';

/**
 * Format Declination (decimal degrees, [-90, 90]) as sexagesimal
 * degrees-minutes-seconds.
 *
 * Format: `±DD°MM'SS.s"` — e.g. 1.396° → "+01°23'45.6\"". The sign is
 * always included (so positive Decs get a leading +). The arcseconds field
 * has one decimal place.
 *
 * Clamps input to [-90, 90] before formatting (asin etc. can produce tiny
 * overshoots due to floating-point arithmetic).
 *
 * @param decDeg  Declination in decimal degrees. Clamped to [-90, 90].
 */
export function formatDecSexagesimal(decDeg: number): string {
  // Clamp to the physically valid range.
  const clamped = Math.max(-90, Math.min(90, decDeg));

  const sign = clamped < 0 ? '-' : '+';
  const abs = Math.abs(clamped);

  // Decompose to deciseconds (subunitFactor = 10).
  const [d, arcMin, decisec] = decomposeSexagesimal(abs, 10);

  // decisec is an integer in [0, 599]; format as SS.s.
  const secInt = Math.floor(decisec / 10);
  const secFrac = decisec % 10;
  const asFmt = `${pad(secInt, 2)}.${secFrac}`;

  return `${sign}${pad(d, 2)}°${pad(arcMin, 2)}'${asFmt}"`;
}
