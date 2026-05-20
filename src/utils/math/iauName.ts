/**
 * Construct an IAU-style coordinate-based galaxy designation, prefixed by
 * the survey's canonical short name.
 *
 * IAU recommends survey name + "J" + truncated coords as a stable, source-
 * derived identifier when no internal catalog ID is preferred — that's the
 * convention SDSS, 2MASS, etc. all follow.  Reusing the format across our
 * surveys keeps the headline string visually consistent (same length, same
 * truncation rules) while still telling the user which catalog the row
 * actually came from.
 *
 * Per-survey prefixes live on `SOURCE_REGISTRY[source].iauPrefix`.
 *
 * The coordinate part itself is identical to SDSS's IAU convention:
 * RA truncated to centisecond precision, Dec to decisecond, leading sign
 * on Dec always present.  Truncation (not rounding) is the IAU rule — the
 * name stays stable as catalog measurements are refined.
 *
 * Reference: SDSS DR18 naming conventions,
 * https://www.sdss.org/dr18/help/glossary/#name
 */

import { pad } from './_sexagesimal';
import { Source, SOURCE_REGISTRY } from '../../data/sources';
import type { SourceType } from '../../@types/data/Source';

/**
 * Compute the coordinate part of an IAU designation: "J<RA><Dec>".
 * Prefix-free so the same coord string can be reused with any survey tag.
 */
function iauCoordPart(raDeg: number, decDeg: number): string {
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

/**
 * Survey-aware IAU designation.  Returns "<prefix> J<RA><Dec>" where the
 * prefix matches the source's canonical short name.
 *
 * Throws for POI sources (Cluster/Supercluster/Void) — those markers
 * carry curated names (e.g. "Virgo Cluster") and have no IAU coordinate
 * designation. Reaching the throw means a POI pick is being formatted by
 * galaxy-headline code; route POI picks through their dedicated info path.
 */
export function iauName(source: SourceType, raDeg: number, decDeg: number): string {
  const entry = SOURCE_REGISTRY[source];
  if (entry.type !== 'survey') {
    throw new Error(`iauName: POI source ${source} has no IAU designation`);
  }
  return `${entry.iauPrefix} ${iauCoordPart(raDeg, decDeg)}`;
}
