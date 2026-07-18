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
 *   - Builds a base accepted set from SDSS > 2MRS > GLADE, in priority order.
 *   - Runs each DESI patch (the deep cone, the dec-band wedge, …) against
 *     that base set — deduped against the higher-priority surveys and against
 *     its own rows, but NOT against sibling patches.
 *   - Accepts each record unless an already-accepted record it is compared
 *     against sits within the position+redshift tolerance — angular
 *     separation < 5 arcsec AND |Δz/(1+min(z))| < 1 %.
 *   - "First in wins", which combined with the priority ordering enforces the
 *     survey-priority rule.
 *
 * Why DESI patches don't dedup against each other:
 *   The cone and the wedge overlap on the sky (~61% of the cone lies inside
 *   the band), and both are opt-in overlays. Deduping wedge-vs-cone would
 *   punch a rectangular hole in the wedge whenever the cone toggles off, so
 *   each patch is deduped only against the shared base (SDSS/2MRS/GLADE) and
 *   its own rows — never against a sibling patch. Enabling both draws the
 *   shared rows twice, which is the intended multi-geometry visualization.
 *
 * Why position+redshift instead of objID?
 *   GLADE's SDSS-DR12 cross-ID column is a *name*, not the numeric SDSS
 *   objID we carry through `ParsedRecord`. We can't match on the integer
 *   ID, so we fall back to the geometric criterion — which is the same one
 *   GLADE itself uses to pre-merge its constituent catalogues.
 *
 * Why are the DESI patches lowest priority, and why through crossMatch at all
 * (unlike Milliquas, which bypasses it — see `buildAllBins.ts`)?
 *   DESI's cone/wedge rows are the *same galaxies* the other three surveys
 *   already catalogue within their own footprints — a Milliquas point is a
 *   physically distinct AGN core from its host-galaxy row, but a DESI BGS row
 *   at z = 0.07 is the identical object SDSS or GLADE may already carry.
 *   Skipping dedup would double-render each patch's low-z end. Running the
 *   patches after the base keeps every existing bin byte-stable (SDSS/2MRS/
 *   GLADE rows are decided before any DESI row is compared, so a patch can
 *   only contribute rows nobody higher-priority has) while the ~15 % low-z
 *   BGS overlap with GLADE/SDSS dedups away. Same-sightline cluster members —
 *   the whole reason these sources exist — survive regardless, because the
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
  /**
   * The DESI patches (deep cone, dec-band wedge, …), each an independent
   * group. A patch is deduped against the base surveys and against its own
   * rows, but NOT against sibling patches — the cone and the wedge overlap
   * deliberately. Grouping (one array per patch) is the isolation boundary;
   * the source travels on each record, so no per-group key is needed.
   */
  desiPatches: readonly ParsedRecord[][];
};

/** A 1°×1° acceptance grid: floor(ra)|floor(dec) → records accepted in that tile. */
type AcceptGrid = Map<string, ParsedRecord[]>;

const cellKey = (ra: number, dec: number): string => `${Math.floor(ra)}|${Math.floor(dec)}`;

/**
 * Small-angle approximation to angular separation in degrees.
 *
 * For our 5-arcsec threshold this is well below 0.01% accurate everywhere
 * except within ~1° of the celestial pole, and we're not building a
 * pole-of-the-sky catalogue. Using cos(mean dec) compresses the RA
 * difference because RA is measured along a longitude line whose physical
 * length shrinks as you move away from the equator.
 */
function angularSepDeg(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const dRa = (ra1 - ra2) * Math.cos(((dec1 + dec2) * 0.5 * Math.PI) / 180);
  const dDec = dec1 - dec2;
  return Math.sqrt(dRa * dRa + dDec * dDec);
}

/**
 * Is `r` a duplicate of any record already accepted in any of `grids`?
 *
 * Scans the 3×3 cell window centred on `r`'s home cell in each grid. The
 * 5-arcsec match radius is much smaller than 1°, so the home cell plus its
 * eight neighbours cover every possible match across a cell boundary. A record
 * is a duplicate iff angular separation is below the position tolerance AND
 * relative redshift is below the redshift tolerance — both gates must trip, so
 * foreground/background pairs along the same line of sight survive.
 */
function isDuplicateIn(grids: readonly AcceptGrid[], r: ParsedRecord): boolean {
  const cx = Math.floor(r.ra);
  const cy = Math.floor(r.dec);
  for (const grid of grids) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cell = grid.get(`${cx + dx}|${cy + dy}`);
        if (!cell) continue;
        for (const other of cell) {
          if (angularSepDeg(r.ra, r.dec, other.ra, other.dec) < POSITION_TOL_DEG) {
            // Normalise by 1+min(z) so the comparison is symmetric — neither
            // record is privileged as "the reference" and the AND-gate is
            // commutative under input reordering.
            const dz = Math.abs(r.z - other.z) / (1 + Math.min(r.z, other.z));
            if (dz < REDSHIFT_TOL_REL) return true;
          }
        }
      }
    }
  }
  return false;
}

/** Record `r` into `grid`'s home cell, allocating the cell lazily. */
function addToGrid(grid: AcceptGrid, r: ParsedRecord): void {
  const k = cellKey(r.ra, r.dec);
  let cell = grid.get(k);
  if (!cell) {
    cell = [];
    grid.set(k, cell);
  }
  cell.push(r);
}

/**
 * Deduplicate the base surveys plus the DESI patches into one merged stream.
 *
 * The base (SDSS > 2MRS > GLADE) is deduped in priority order into a single
 * grid — "first one wins", so concatenating in priority order enforces the
 * preference. Each DESI patch then runs against that base grid PLUS a fresh
 * per-patch grid (so within-patch duplicates still drop) — but never against
 * another patch's grid, so the cone and the wedge can overlap.
 *
 * A `Map<string, …>` grid (rather than a 360×180 dense array) avoids
 * allocating ~65k empty arrays for the mostly-empty celestial sphere, and
 * keeps the runtime near-linear in N: the average cell density stays small at
 * SDSS scales (~500k records over ~14k sq deg ≈ 35 per cell), so each
 * candidate compares against a tiny constant-bounded set.
 */
export function crossMatch(inputs: CrossMatchInputs): ParsedRecord[] {
  const accepted: ParsedRecord[] = [];

  // Base surveys, in priority order into one shared grid.
  const base: AcceptGrid = new Map();
  for (const r of [...inputs.sdss, ...inputs.twoMrs, ...inputs.glade]) {
    if (isDuplicateIn([base], r)) continue;
    accepted.push(r);
    addToGrid(base, r);
  }

  // Each DESI patch: dedup against the shared base grid and its own rows, but
  // NOT against sibling patches (a fresh grid per patch keeps them isolated).
  for (const patch of inputs.desiPatches) {
    const patchGrid: AcceptGrid = new Map();
    for (const r of patch) {
      if (isDuplicateIn([base, patchGrid], r)) continue;
      accepted.push(r);
      addToGrid(patchGrid, r);
    }
  }

  return accepted;
}
