/**
 * Format a Right Ascension value (decimal degrees) as a sexagesimal string.
 *
 * Astronomical convention expresses RA in hours where 24h = 360°, so 1h = 15°.
 * The output format is `HHhMMmSS.ssS` (e.g. 188.7365° → "12h34m56.76s").
 *
 * Intended for display in the hover / info-card UI where the raw decimal
 * degree value is less readable than the traditional hours-minutes-seconds form.
 */

import { decomposeSexagesimal, pad } from './_sexagesimal';

/**
 * Format Right Ascension (decimal degrees, [0, 360)) as sexagesimal
 * hours-minutes-seconds.
 *
 * Astronomical convention: RA is expressed in hours where 24h = 360°,
 * so 1h = 15°. Format: `HHhMMmSS.ssS` — e.g. 188.7365° → "12h34m56.76s".
 *
 * Wraps the input into [0, 360) so values like -10° or 370° still produce
 * a valid sexagesimal string.
 *
 * @param raDeg  Right Ascension in decimal degrees. Any real number — will
 *               be wrapped into [0, 360) before conversion.
 */
export function formatRaSexagesimal(raDeg: number): string {
  // Wrap into [0, 360). The ((x % 360) + 360) % 360 idiom handles both
  // negative values (e.g. -10° → 350°) and values above 360° (e.g. 370° → 10°).
  const wrapped = ((raDeg % 360) + 360) % 360;

  // Convert degrees to hours: 24h = 360°, so divide by 15.
  const totalHours = wrapped / 15;

  // Decompose to centiseconds (subunitFactor = 100).
  const [h, m, centisec] = decomposeSexagesimal(totalHours, 100);

  // centisec is an integer in [0, 5999]; format as SS.ss.
  const secInt = Math.floor(centisec / 100);
  const secFrac = centisec % 100;
  const sFmt = `${pad(secInt, 2)}.${pad(secFrac, 2)}`;

  return `${pad(h, 2)}h${pad(m, 2)}m${sFmt}s`;
}
