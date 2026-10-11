/**
 * REGALADE v2 parser — VizieR J/A+A/706/A284 (Tranin+ 2026, A&A 706, A284):
 * ~71.5 M galaxies to 2000 Mpc merged from 16 catalogs, 348-byte fixed-width
 * rows (offsets below are the ReadMe's 1-based inclusive bytes, via `slot`).
 * `Dist` is a *luminosity* distance and is REGALADE's headline product (its
 * v2 priority chain + outlier guards), so position comes from `Dist`
 * inverted through the pipeline's own cosmology; the catalogued `z` only
 * surfaces as `spectroscopicZ`, and only when `Refzin` names a spectroscopic
 * parent (paper Table 1 index: 3 DESI-PV, 4 DESI-DR1, 7 NED-LVS-zsp).
 * Kron g/r/i/z are PS1 / DELVE / LS photometry, not SDSS — `r_gmag` says which.
 * `source` is left off the record on purpose: see `@types/RegaladeRecord`.
 */

import { arcsecToKpc } from '../../src/utils/math/arcsecToKpc';
import { isPlausibleMagnitude } from '../utils/math/isPlausibleMagnitude';
import { luminosityDistanceMpcToRedshift } from '../utils/math/luminosityDistanceMpcToRedshift';
import { parseFloatOrNaN } from '../utils/math/parseFloatOrNaN';
import type { RegaladeRecord } from './@types/RegaladeRecord';
import type { RegaladeResult } from './@types/RegaladeResult';
import { slot } from './common';

/** `Flag` sits at byte 348, so a shorter line can't be sliced safely. */
const REGALADE_LRECL = 348;

const SPECTROSCOPIC_REFZIN = new Set([3, 4, 7]);

function parseMagOrNaN(s: string): number {
  const v = parseFloatOrNaN(s);
  return isPlausibleMagnitude(v) ? v : NaN;
}

/**
 * One row → record, or `null` for a counted skip (truncated line, unparseable
 * RA/Dec, non-positive `Dist`). Exposed line-wise so the 25 GB file can be
 * streamed through `readline` the way GLADE is.
 */
export function parseRegaladeLine(line: string): RegaladeRecord | null {
  if (line.length < REGALADE_LRECL) return null;

  const ra = parseFloat(slot(line, 33, 42));
  const dec = parseFloat(slot(line, 44, 53));
  const distMpc = parseFloat(slot(line, 55, 66));
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || !(distMpc > 0)) return null;

  const z = luminosityDistanceMpcToRedshift(distMpc);
  const refZ = parseInt(slot(line, 314, 315), 10);
  const spectroscopicZ = SPECTROSCOPIC_REFZIN.has(refZ) ? parseFloatOrNaN(slot(line, 68, 79)) : NaN;

  // Semi-axes in arcsec; a 3″/3″/0° or 90° triple is the catalog's own
  // "no fit" placeholder, which we pass through as a round 6″ source.
  const r1 = parseFloatOrNaN(slot(line, 165, 177));
  const r2 = parseFloatOrNaN(slot(line, 179, 191));
  const pa = parseFloatOrNaN(slot(line, 193, 204));
  const hasEllipse = r1 > 0 && r2 > 0 && Number.isFinite(pa);

  return {
    objID: 0n,
    ra,
    dec,
    z,
    spectroscopicZ,
    magU: NaN,
    magG: parseMagOrNaN(slot(line, 215, 222)),
    magR: parseMagOrNaN(slot(line, 224, 231)),
    magI: parseMagOrNaN(slot(line, 233, 240)),
    magZ: parseMagOrNaN(slot(line, 242, 249)),
    axisRatio: hasEllipse ? Math.min(1, r2 / r1) : null,
    positionAngleDeg: hasEllipse ? ((pa % 180) + 180) % 180 : null,
    diameterKpc: hasEllipse ? arcsecToKpc(2 * r1, distMpc / (1 + z)) : null,
    angularMajorAxisArcsec: hasEllipse ? 2 * r1 : undefined,
    classByte: 0,
    parentSurveyByte: 0,
  };
}

/** Whole-text convenience over `parseRegaladeLine` for fixtures and small cuts. */
export function parseRegalade(rawText: string): RegaladeResult {
  const records: RegaladeRecord[] = [];
  let skipped = 0;
  for (const line of rawText.split(/\r?\n/)) {
    if (line === '') continue;
    const rec = parseRegaladeLine(line);
    if (rec) records.push(rec);
    else skipped++;
  }
  return { records, skipped };
}
