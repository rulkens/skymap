import { existsSync, readFileSync } from 'node:fs';

import { rawDataPath } from '../utils/io/rawDataRegistry';
import { slot } from './common';

/**
 * Cosmicflows-4 parser — CDS VizieR table J/ApJ/944/94 (Tully+ 2023).
 *
 * Fixed-width ASCII; byte offsets from `data/raw/cf4/ReadMe`.  PGC is the
 * sole cross-match key in table2.dat (no 2MASS XSC column). 2MRS rows whose
 * `objID` is a 2MASS XSC integer get patched to a PGC by `buildAllBins`'s
 * GLADE cross-pollination pass; unmatched rows fall through to the cz path.
 * RA/Dec are carried so a future cone-match fallback can be added without
 * re-parsing; `catalogDistanceFor` currently consults only the PGC map.
 *
 * ## Column offsets (1-based inclusive, from ReadMe)
 *
 *   PGC    bytes  1.. 7   I7    integer
 *   DM     bytes 29..34   F6.3  distance modulus (mag)
 *   e_DM   bytes 36..40   F5.3  1-σ uncertainty on DM (mag)
 *   RAdeg  bytes 138..145 F8.4  J2000 RA (decimal degrees)
 *   DEdeg  bytes 147..154 F8.4  J2000 Dec (decimal degrees)
 *
 *   d_Mpc = 10^((DM − 25) / 5)    ed_Mpc = d_Mpc · (ln10 / 5) · eDM
 */

export type Cf4Record = {
  /** Numeric PGC, or null when CF4 has no PGC cross-walk for this row. */
  pgc: number | null;
  /** Distance in megaparsecs. Always > 0; rows without DM are skipped. */
  distMpc: number;
  /** 1-σ distance uncertainty in megaparsecs. 0 when CF4's e_DM cell is blank. */
  eDistMpc: number;
  /** J2000 RA in decimal degrees. NaN when blank (rare). */
  raDeg: number;
  /** J2000 Dec in decimal degrees. NaN when blank (rare). */
  deDeg: number;
};

function dmToMpc(dm: number, eDm: number): { distMpc: number; eDistMpc: number } {
  const distMpc = Math.pow(10, (dm - 25) / 5);
  // d/dDM of d_Mpc = d_Mpc * ln(10) / 5
  const eDistMpc = distMpc * (Math.LN10 / 5) * eDm;
  return { distMpc, eDistMpc };
}

/**
 * Parse one CF4 data row. Returns null when the row lacks a usable
 * distance modulus (CF4 includes some catalogued-but-undetermined rows
 * we have no use for).
 */
export function parseCf4Line(line: string): Cf4Record | null {
  const pgcRaw = slot(line, 1, 7);
  const dmRaw = slot(line, 29, 34);
  const eDmRaw = slot(line, 36, 40);
  const raRaw = slot(line, 138, 145);
  const deRaw = slot(line, 147, 154);

  if (dmRaw === '') return null;
  const dm = parseFloat(dmRaw);
  if (!Number.isFinite(dm)) return null;

  // The uncertainty CAN legitimately be blank for older measurements;
  // surface 0 in that case so downstream code that compares
  // uncertainties doesn't see NaN. The presence of DM is the gate.
  const eDm = eDmRaw === '' ? 0 : parseFloat(eDmRaw);

  // PGC: "0" and blank both mean "no PGC for this row" — collapse to
  // null so the index never keys on the bogus zero.
  let pgc: number | null;
  if (pgcRaw === '' || pgcRaw === '0') {
    pgc = null;
  } else {
    const parsed = parseInt(pgcRaw, 10);
    pgc = Number.isFinite(parsed) ? parsed : null;
  }

  const raDeg = raRaw === '' ? NaN : parseFloat(raRaw);
  const deDeg = deRaw === '' ? NaN : parseFloat(deRaw);

  const { distMpc, eDistMpc } = dmToMpc(dm, Number.isFinite(eDm) ? eDm : 0);
  return { pgc, distMpc, eDistMpc, raDeg, deDeg };
}

export type Cf4CatalogIndex = {
  byPgc: ReadonlyMap<number, Cf4Record>;
};

/**
 * Walk table2.dat text and build a PGC-keyed index. Skips blank/comment
 * lines, rows without a usable DM, and rows without a PGC. PGC-only keying
 * reflects CF4's schema; 2MASS XSC, cone, and 1PGC lookups are deferred.
 */
export function buildCf4CatalogIndex(rawText: string): Cf4CatalogIndex {
  const byPgc = new Map<number, Cf4Record>();
  for (const line of rawText.split(/\r?\n/)) {
    if (line.length === 0 || line.startsWith('#')) continue;
    const rec = parseCf4Line(line);
    if (rec === null || rec.pgc === null) continue;
    byPgc.set(rec.pgc, rec);
  }
  return { byPgc };
}

/**
 * Load and parse CF4 from disk. Returns an empty index when the file is
 * absent so builds succeed without it (the local-volume override is simply
 * skipped). Logs a stderr note so the skip isn't silent.
 */
export function loadCf4CatalogIndex(
  path: string = rawDataPath('cf4.table2'),
): Cf4CatalogIndex {
  if (!existsSync(path)) {
    process.stderr.write(
      `  ${path} not present — CF4 local-volume override will be skipped\n`,
    );
    return { byPgc: new Map() };
  }
  const text = readFileSync(path, 'utf8');
  const index = buildCf4CatalogIndex(text);
  process.stderr.write(
    `  CF4: ${index.byPgc.size.toLocaleString()} PGCs indexed\n`,
  );
  return index;
}
