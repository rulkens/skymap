/**
 * Cosmicflows-4 parser.
 *
 * Reads CDS Vizier table J/ApJ/944/94 (Tully+ 2023). The on-disk
 * format is fixed-width ASCII; column byte offsets come from the
 * CF4 ReadMe shipped alongside table2.dat in data/raw/cf4/ReadMe.
 *
 * The parser yields one `Cf4Record` per data row, dropping rows
 * without a usable distance modulus. PGC is the *only* cross-match
 * identifier in CF4 table2.dat — the original spec assumed a 2MASS
 * XSC column also existed, but the actual ReadMe (verified on
 * 2026-05-27 against data/raw/cf4/ReadMe) lists only PGC and a
 * companion 1PGC (group dominant) ID. For 2MRS rows whose `objID`
 * is the 2MASS XSC integer rather than a PGC, the GLADE
 * cross-pollination pass in `buildAllBins` patches `objID` to the
 * matched PGC; unmatched 2MRS rows fall through to the cz path.
 *
 * RA/Dec are exposed in the parsed record so a future cone-match
 * fallback can be added without re-parsing the file. The lookup in
 * `catalogDistanceFor` only consults the PGC map today.
 *
 * ## Column offsets (1-based, inclusive — verified against ReadMe 2026-05-27)
 *
 *   PGC    bytes  1.. 7   I7,     integer
 *   DM     bytes 29..34   F6.3,   distance modulus in mag
 *   e_DM   bytes 36..40   F5.3,   1-σ uncertainty on DM in mag
 *   RAdeg  bytes 138..145 F8.4,   J2000 RA in decimal degrees
 *   DEdeg  bytes 147..154 F8.4,   J2000 Dec in decimal degrees
 *
 * Distance is computed from DM via the standard relation:
 *
 *     d_Mpc = 10 ^ ((DM - 25) / 5)
 *
 * with the uncertainty propagated via the derivative:
 *
 *     ed_Mpc = d_Mpc * (ln 10 / 5) * eDM
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
 * Slice a fixed-width line in 1-based-inclusive (start, end) coordinates
 * and trim whitespace. Returns '' for slices that lie past the line end.
 */
function slot(line: string, start: number, end: number): string {
  return line.slice(start - 1, end).trim();
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
 * Walk the raw table2.dat text and build a PGC-keyed index. Rows are
 * skipped if:
 *   - the line is blank or starts with `#` (CDS uses # for comments)
 *   - `parseCf4Line` returns null (no usable distance modulus)
 *   - the row has no PGC (CF4 always has one in practice — 100% PGC
 *     coverage on the 2026-05-27 release — but the guard keeps the
 *     map clean if a future release ships rows without)
 *
 * The index is PGC-only because CF4 table2.dat publishes PGC as its
 * sole cross-match identifier. 2MASS XSC matching, cone matching, and
 * 1PGC (group dominant) keying are all deferred — see the module
 * docstring above.
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
