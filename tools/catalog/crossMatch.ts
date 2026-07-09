/**
 * Cross-survey deduplication of parsed catalogue records.
 *
 * Lives in its own module — separate from `buildAllBins.ts` — for one
 * reason: `buildAllBins.ts` imports Node-only APIs (`node:fs`, `node:path`,
 * `node:url`) so that it can be invoked as a CLI. The main `tsconfig.json`
 * deliberately excludes `tools/` and does not pull in `@types/node`, so any
 * test under `tests/` that transitively imported a Node API would fail
 * typecheck. By keeping the pure-logic dedup in this Node-free module, the
 * test (`tests/crossMatch.test.ts`) can import it without dragging Node
 * types into the browser-side compilation.
 *
 * What the merger actually does:
 *   - Concatenates the four input arrays in priority order
 *     (SDSS > 2MRS > GLADE > DESI Deep).
 *   - Walks the union and accepts each record unless an already-accepted
 *     record sits within the position+redshift tolerance — angular
 *     separation < 5 arcsec AND |Δz/(1+min(z))| < 1 %.
 *   - "First in wins", which combined with the priority concatenation
 *     enforces the survey-priority rule.
 *
 * Why position+redshift instead of objID?
 *   GLADE's SDSS-DR12 cross-ID column is a *name*, not the numeric SDSS
 *   objID we carry through `ParsedRecord`. We can't match on the integer
 *   ID, so we fall back to the geometric criterion — which is the same one
 *   GLADE itself uses to pre-merge its constituent catalogues.
 *
 * Why is DESI Deep lowest priority, and why through crossMatch at all
 * (unlike Milliquas, which bypasses it — see `buildAllBins.ts`)?
 *   DESI's ultra-deep cone rows are the *same galaxies* the other three
 *   surveys already catalogue within their own footprints — a Milliquas
 *   point is a physically distinct AGN core from its host-galaxy row, but
 *   a DESI BGS row at z = 0.07 is the identical object SDSS or GLADE may
 *   already carry. Skipping dedup would double-render the cone's low-z
 *   end. Lowest priority keeps every existing bin byte-stable (SDSS/2MRS/
 *   GLADE rows are decided before DESI is even concatenated in, so DESI
 *   can only contribute rows nobody else has) while the ~15 % low-z BGS
 *   overlap with GLADE/SDSS dedups away. Same-sightline cluster members —
 *   the whole reason this source exists — survive regardless, because the
 *   AND-gate (position AND redshift) never collapses two real objects at
 *   different z onto the same accepted slot.
 */

import type { ParsedRecord } from '../parsers/common';

/**
 * Position tolerance: 5 arcseconds expressed in degrees.
 *
 * 5 arcsec is the standard cross-matching radius used by GLADE itself when
 * merging its parent catalogues, and it sits comfortably above SDSS's
 * astrometric scatter (~0.1 arcsec) while still being well below the typical
 * separation of distinct galaxies (a few arcmin in the local universe).
 */
const ARC_SEC_IN_DEG = 1 / 3600;
const POSITION_TOL_DEG = 5 * ARC_SEC_IN_DEG;

/**
 * Relative redshift tolerance: |Δz| / (1+z_min) < 1 %.
 *
 * 1 % is loose enough to absorb the difference between SDSS spec-z (precision
 * ~10⁻⁴) and a 2MPZ photo-z (precision ~0.015) — both of which can describe
 * the same galaxy — but tight enough that two genuinely distinct galaxies on
 * the same line of sight (Δz of order 0.01 or more) are kept separate.
 */
const REDSHIFT_TOL_REL = 0.01;

export type CrossMatchInputs = {
  sdss: ParsedRecord[];
  twoMrs: ParsedRecord[];
  glade: ParsedRecord[];
  desiDeep: ParsedRecord[];
};

/**
 * Deduplicate the union of four per-survey record arrays into one merged
 * stream, applying the SDSS > 2MRS > GLADE > DESI Deep priority rule.
 *
 * Algorithm:
 *   1. Concatenate the inputs in priority order. The first record reaching
 *      a given sky+z neighbourhood "claims" it.
 *   2. Bin records into a 1°×1° grid keyed by floor(ra), floor(dec). The
 *      5-arcsec match radius is much smaller than 1°, so checking the
 *      record's own cell plus its eight neighbours is sufficient — we
 *      never miss a potential match across a cell boundary.
 *   3. For each candidate, compare against every previously-accepted record
 *      in the surrounding 9 cells. Reject if angular separation is below
 *      the position tolerance AND relative redshift is below the redshift
 *      tolerance. Both gates must trip, so foreground/background pairs
 *      along the same line of sight survive.
 *
 * The grid keeps the runtime near-linear in N: the average cell density
 * stays small at SDSS scales (~500k records over ~14k sq deg ≈ 35 per
 * cell), so each candidate compares against a tiny constant-bounded set.
 */
export function crossMatch(inputs: CrossMatchInputs): ParsedRecord[] {
  // Priority order: SDSS first, then 2MRS, then GLADE, then DESI Deep
  // last. The dedup loop below uses "first one wins" semantics, so
  // concatenating in priority order is what enforces the
  // SDSS > 2MRS > GLADE > DESI Deep preference.
  const all: ParsedRecord[] = [
    ...inputs.sdss,
    ...inputs.twoMrs,
    ...inputs.glade,
    ...inputs.desiDeep,
  ];

  // 2D grid keyed by floor(ra),floor(dec); each cell holds the records
  // already accepted in that 1°×1° tile. Using a Map<string, …> rather
  // than a 360×180 dense array avoids allocating ~65k empty arrays for
  // the (mostly empty) celestial sphere.
  const grid = new Map<string, ParsedRecord[]>();
  const cellKey = (ra: number, dec: number): string => `${Math.floor(ra)}|${Math.floor(dec)}`;

  /**
   * Small-angle approximation to angular separation in degrees.
   *
   * For our 5-arcsec threshold this is well below 0.01% accurate everywhere
   * except within ~1° of the celestial pole, and we're not building a
   * pole-of-the-sky catalogue. Using cos(mean dec) compresses the RA
   * difference because RA is measured along a longitude line whose
   * physical length shrinks as you move away from the equator.
   */
  function angularSepDeg(ra1: number, dec1: number, ra2: number, dec2: number): number {
    const dRa = (ra1 - ra2) * Math.cos(((dec1 + dec2) * 0.5 * Math.PI) / 180);
    const dDec = dec1 - dec2;
    return Math.sqrt(dRa * dRa + dDec * dDec);
  }

  const accepted: ParsedRecord[] = [];

  for (const r of all) {
    let isDuplicate = false;
    const cx = Math.floor(r.ra);
    const cy = Math.floor(r.dec);

    // Scan the 3×3 cell window centred on this record's home cell.
    // Breaking out of both loops via the `isDuplicate` flag avoids
    // wasted comparisons after we've already decided to drop the record.
    for (let dy = -1; dy <= 1 && !isDuplicate; dy++) {
      for (let dx = -1; dx <= 1 && !isDuplicate; dx++) {
        const cell = grid.get(`${cx + dx}|${cy + dy}`);
        if (!cell) continue;
        for (const other of cell) {
          if (angularSepDeg(r.ra, r.dec, other.ra, other.dec) < POSITION_TOL_DEG) {
            // Normalise by 1+min(z) so the comparison is symmetric — neither
            // record is privileged as "the reference" and the AND-gate is
            // commutative under input reordering.
            const dz = Math.abs(r.z - other.z) / (1 + Math.min(r.z, other.z));
            if (dz < REDSHIFT_TOL_REL) {
              isDuplicate = true;
              break;
            }
          }
        }
      }
    }
    if (isDuplicate) continue;

    accepted.push(r);
    const k = cellKey(r.ra, r.dec);
    let cell = grid.get(k);
    if (!cell) {
      cell = [];
      grid.set(k, cell);
    }
    cell.push(r);
  }

  return accepted;
}
