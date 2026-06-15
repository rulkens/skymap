/**
 * MCXC Meta-Catalogue of X-ray detected Clusters parser —
 * VizieR catalog J/A+A/534/A109 (Piffaretti et al. 2011).
 *
 * 1743 clusters from 12 ROSAT-based X-ray surveys, homogenised and
 * deduplicated. R500 (Mpc, Δ=500 overdensity) is used directly rather than
 * re-deriving it from M500, keeping provenance traceable to the ROSAT analyses.
 *
 * ### Format: 323-byte fixed-width ASCII (mcxc.dat)
 *
 * Byte ranges are 1-based inclusive (ReadMe convention); `slot()` handles
 * the JS slice offset. All numeric fields are space-padded F7.3/F6.4/F7.4.
 *
 *   bytes  1– 12  MCXC id   A12, e.g. 'J0000.1+0816'
 *   bytes 14– 31  OName     A18, usually the RXC/REFLEX designation
 *   bytes 33– 86  AName     A54, Abell number or popular name (often blank)
 *   bytes 109–115 RAdeg     F7.3 deg, decimal RA J2000
 *   bytes 117–123 DEdeg     F7.3 deg, decimal Dec J2000 (signed)
 *   bytes 141–146 z         F6.4, spectroscopic redshift
 *   bytes 190–196 M500      F7.4, 10^14 M☉
 *   bytes 198–204 R500      F7.4, Mpc
 *
 * We use the pre-computed decimal RAdeg/DEdeg (bytes 109–123) rather than the
 * sexagesimal columns (bytes 88–107) to avoid sign-byte assembly and h→° math.
 *
 * ### Line-length note
 *
 * Lrecl=323 but rows without catalogue overlaps are ~204 bytes. All fields we
 * extract end by byte 204; we skip rows shorter than that rather than silently
 * producing NaN.
 */

import { nonCommentLines, slot } from './common';

/** Minimum useful line length — R500 column ends at byte 204. */
const MIN_LINE_LEN = 204;

/**
 * A single parsed MCXC cluster row, carrying the fields the structure-coverage
 * pipeline consumes.  String fields are trimmed; blank columns become `''`.
 */
export type McxcRow = {
  /** MCXC primary identifier, e.g. `'J0000.1+0816'`. */
  id: string;
  /** Right ascension in decimal degrees (J2000), [0, 360). */
  raDeg: number;
  /** Declination in decimal degrees (J2000), [−90, 90]. */
  decDeg: number;
  /** Spectroscopic redshift. */
  z: number;
  /** Total mass within R500, in units of 10^14 M☉. */
  m500: number;
  /** Characteristic radius R500, in Mpc. */
  r500Mpc: number;
  /** 'Other name' — usually the RXC/REFLEX designation; `''` if blank. */
  oName: string;
  /** 'Alternative name' — Abell/UGC/popular name; `''` if blank. */
  aName: string;
};

/**
 * Parse a raw `mcxc.dat` blob into `McxcRow[]`. IO-free so unit tests can
 * pass fixture strings directly. Skips blank/comment lines, lines shorter
 * than MIN_LINE_LEN (can't carry R500), and rows with non-finite numerics.
 */
export function parseMcxc(raw: string): McxcRow[] {
  const rows: McxcRow[] = [];

  for (const line of nonCommentLines(raw)) {
    if (line.length < MIN_LINE_LEN) continue;

    // Byte ranges are 1-based inclusive per the ReadMe; `slot` handles the offset.
    const id = slot(line, 1, 12);
    const oName = slot(line, 14, 31);
    const aName = slot(line, 33, 86); // often blank; slot trims → ''
    const raDeg = parseFloat(slot(line, 109, 115)); // pre-computed decimal degrees
    const decDeg = parseFloat(slot(line, 117, 123));
    const z = parseFloat(slot(line, 141, 146));
    const m500 = parseFloat(slot(line, 190, 196)); // 10^14 M☉
    const r500Mpc = parseFloat(slot(line, 198, 204));

    // NaN here means the file is truncated or the wrong format — MCXC has no
    // documented sentinel for missing values in these columns.
    if (
      !Number.isFinite(raDeg) ||
      !Number.isFinite(decDeg) ||
      !Number.isFinite(z) ||
      !Number.isFinite(m500) ||
      !Number.isFinite(r500Mpc)
    ) {
      continue;
    }

    rows.push({ id, raDeg, decDeg, z, m500, r500Mpc, oName, aName });
  }

  return rows;
}
