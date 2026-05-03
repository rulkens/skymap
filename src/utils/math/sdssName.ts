/**
 * Construct an IAU-style SDSS object name from sky coordinates.
 *
 * SDSS designations have the form "SDSS J<RA><Dec>" where RA is expressed
 * to centisecond precision and Dec to decisecond precision — both truncated
 * (not rounded) so the name is stable as catalog measurements are refined.
 *
 * Example: ra=188.7365°, dec=+1.396° → "SDSS J123456.75+012345.5"
 *
 * Reference: SDSS DR18 naming conventions,
 * https://www.sdss.org/dr18/help/glossary/#name
 */

import { pad } from './_sexagesimal';

/**
 * Construct the IAU-style designation for an SDSS object: "SDSS J<RA><Dec>".
 *
 * The convention truncates (NOT rounds) to specific precision so the name
 * stays stable as catalogs are updated:
 *   - RA:  HHMMSS.ss  (centisecond precision)
 *   - Dec: ±DDMMSS.s  (decisecond precision)
 *
 * Example: ra=188.7365°, dec=+1.396° → "SDSS J123456.76+012345.6"
 *
 * The leading sign on the Dec part is always present.
 *
 * Reference: SDSS DR18 naming conventions,
 * https://www.sdss.org/dr18/help/glossary/#name
 *
 * @param raDeg   Right Ascension in decimal degrees. Wrapped into [0, 360).
 * @param decDeg  Declination in decimal degrees. Clamped to [-90, 90].
 */
export function sdssName(raDeg: number, decDeg: number): string {
  // ── RA part ───────────────────────────────────────────────────────────────
  // Wrap into [0, 360) then convert to hours (24h = 360°, so divide by 15).
  const wrappedRa = ((raDeg % 360) + 360) % 360;

  // To avoid floating-point precision loss from dividing by 15 early, we
  // compute total centiseconds-of-time by multiplying degrees × 3600 × 100
  // first, then dividing by 15. Division last minimises accumulated error
  // because 3600 × 100 = 360000 is exact in float64, and the final ÷15 is
  // the only lossy step. For most SDSS coordinates the result is within 0.5
  // of the true integer, so Math.trunc gives the correct truncated digit.
  // Compare: wrappedRa/15 × 3600 × 100 suffers two lossy operations before trunc.
  const raTotalCentisec = Math.trunc(wrappedRa * 3600 * 100 / 15);

  // Decompose with integer division — no further floating-point arithmetic.
  const raH = Math.floor(raTotalCentisec / (60 * 60 * 100));
  const raRemAfterH = raTotalCentisec % (60 * 60 * 100);
  const raM = Math.floor(raRemAfterH / (60 * 100));
  const raCentisec = raRemAfterH % (60 * 100);

  const raSecInt = Math.floor(raCentisec / 100);
  const raSecFrac = raCentisec % 100;
  const raSecFmt = `${pad(raSecInt, 2)}.${pad(raSecFrac, 2)}`;

  const raPart = `${pad(raH, 2)}${pad(raM, 2)}${raSecFmt}`;

  // ── Dec part ──────────────────────────────────────────────────────────────
  const clampedDec = Math.max(-90, Math.min(90, decDeg));
  const decSign = clampedDec < 0 ? '-' : '+';
  const absD = Math.abs(clampedDec);

  // Convert degrees to total deciseconds of arc by truncation (not rounding).
  // 1° = 3600 arcsec = 36000 deciseconds.
  const decTotalDecisec = Math.trunc(absD * 3600 * 10);

  // Integer decompose — no floating-point arithmetic from here.
  const decD = Math.floor(decTotalDecisec / (60 * 60 * 10));
  const decRemAfterD = decTotalDecisec % (60 * 60 * 10);
  const decM = Math.floor(decRemAfterD / (60 * 10));
  const decDecisec = decRemAfterD % (60 * 10);

  const decSecInt = Math.floor(decDecisec / 10);
  const decSecFrac = decDecisec % 10;
  const decSecFmt = `${pad(decSecInt, 2)}.${decSecFrac}`;

  const decPart = `${decSign}${pad(decD, 2)}${pad(decM, 2)}${decSecFmt}`;

  return `SDSS J${raPart}${decPart}`;
}
