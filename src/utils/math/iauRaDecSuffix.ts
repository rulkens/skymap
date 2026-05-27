/**
 * Build the coordinate-only portion of an IAU-style designation:
 * `J<RA><Dec>`, where RA is truncated to centisecond-of-time precision
 * and Dec to decisecond-of-arc precision.  Truncation (not rounding) is
 * the IAU rule — it keeps the name stable as catalog measurements are
 * refined.
 *
 * Factored out of `iauName(source, ra, dec)` so any string the engine
 * builds from `"<prefix> J<RA><Dec>"` can reuse the same exact emitter.
 * Today the consumers are:
 *
 *   - `iauName(source, ra, dec)` — survey-aware designation
 *     (`"SDSS J…"`, `"2MASX J…"`, etc.).
 *   - `galaxyInfoBuilder` — Milliquas display-name reconstruction
 *     from the bin's `parentSurveyByte` (`"SDSS J…"`, `"2MASX J…"`,
 *     `"GAIA J…"`, …) without going through the survey enum, since
 *     Milliquas rows can carry any of those parent prefixes.
 *
 * Sharing one suffix builder guarantees the historical IAU strings
 * (`"SDSS J123456.75+012345.5"`) stay byte-identical to the strings the
 * Milliquas branch now reconstructs from the bin, so existing
 * regression tests that lock the IAU format keep passing without
 * special-cased duplicate emitters.
 *
 * Reference: SDSS DR18 naming conventions,
 * https://www.sdss.org/dr18/help/glossary/#name
 */

import { pad } from './_sexagesimal';

/**
 * Compute `J<RA><Dec>` for the given sky coordinates in degrees.
 * Pure — no I/O, no globals.  Output is ASCII-safe for filename use.
 */
export function iauRaDecSuffix(raDeg: number, decDeg: number): string {
  // ── RA part ───────────────────────────────────────────────────────────────
  // Wrap into [0, 360) then convert to hours (24h = 360°, so divide by 15).
  const wrappedRa = ((raDeg % 360) + 360) % 360;

  // To avoid floating-point precision loss from dividing by 15 early, we
  // compute total centiseconds-of-time by multiplying degrees × 3600 × 100
  // first, then dividing by 15.  Division last minimises accumulated error
  // because 3600 × 100 = 360000 is exact in float64, and the final ÷15 is
  // the only lossy step.
  const raTotalCentisec = Math.trunc((wrappedRa * 3600 * 100) / 15);

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

  const decD = Math.floor(decTotalDecisec / (60 * 60 * 10));
  const decRemAfterD = decTotalDecisec % (60 * 60 * 10);
  const decM = Math.floor(decRemAfterD / (60 * 10));
  const decDecisec = decRemAfterD % (60 * 10);

  const decSecInt = Math.floor(decDecisec / 10);
  const decSecFrac = decDecisec % 10;
  const decSecFmt = `${pad(decSecInt, 2)}.${decSecFrac}`;

  return `J${raPart}${decSign}${pad(decD, 2)}${pad(decM, 2)}${decSecFmt}`;
}
