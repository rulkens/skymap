/**
 * selectTierRecords — tier selection that unions a volume-limited backbone
 * with an optional apparent-magnitude flux supplement.
 *
 * ### Why the backbone alone isn't enough
 *
 * `subsampleByAbsMag` keeps the brightest N galaxies by *absolute* magnitude.
 * That's a volume-limited sample — it preserves large-scale structure and, by
 * construction, introduces no shells (there's no spatial boundary in the
 * selection). But it has a brutal side effect on the local volume: nearby
 * galaxies are intrinsically faint dwarfs, so they sink to the bottom of the
 * global M_abs ranking and get cut. Measured on GLADE, a 400k-by-M_abs cut
 * keeps 36 of ~10,300 galaxies inside 40 Mpc, and *zero* inside 10 Mpc.
 *
 * ### The supplement, and why a flux limit (not a distance cutoff)
 *
 * On top of the backbone we keep every galaxy brighter than an apparent-
 * magnitude limit `fluxSupplementMagLimit` (read from the `magG` slot, which
 * holds each survey's selection-band apparent mag). A flux limit has no
 * spatial boundary: the kept fraction of galaxies tapers smoothly with
 * distance, exactly how real nearby catalogs look — so it adds the local
 * volume back *without* a visible shell. A naive "keep everything < D Mpc"
 * rule is what would create one.
 *
 * Selecting on apparent `magG` is also redshift-independent, so the supplement
 * rescues z ≤ 0 galaxies (negative-cz Local Group members) that the backbone's
 * `z > 0` distance filter drops outright.
 *
 * ### Composition over duplication
 *
 * The backbone half delegates to `subsampleIndicesByAbsMag` so the two
 * functions can never drift on which records survive the M_abs cut. We union
 * on *indices* (not records) to dedupe the overlap — a luminous nearby galaxy
 * is picked by both halves — then return survivors in original input order, the
 * same invariant `subsampleByAbsMag` preserves for the downstream dedup pass.
 *
 * @param records  Parsed records for one survey. Read-only.
 * @param target   Brightest-N cap for the backbone (same semantics as
 *                 `subsampleByAbsMag`: 0 → [], ≥ length → no cut).
 * @param fluxSupplementMagLimit  Apparent-mag floor; keep every record with a
 *                 finite `magG` strictly brighter than this, in addition to the
 *                 backbone. `undefined` → backbone only (identical to
 *                 `subsampleByAbsMag(records, target)`).
 * @returns        Fresh array of selected records in original input order.
 */

import { subsampleIndicesByAbsMag } from './subsampleByAbsMag.js';
import type { ParsedRecord } from '../parsers/common.js';

export function selectTierRecords(
  records: ParsedRecord[],
  target: number,
  fluxSupplementMagLimit?: number,
): ParsedRecord[] {
  const backbone = subsampleIndicesByAbsMag(records, target);

  // No supplement requested → behave exactly like the pure backbone cut.
  if (fluxSupplementMagLimit === undefined) {
    return backbone.map((i) => records[i]!);
  }

  // Seed the kept set with the backbone, then fold in every record whose
  // apparent magnitude clears the flux floor. The Set dedupes the overlap.
  const kept = new Set<number>(backbone);
  for (let i = 0; i < records.length; i++) {
    const magG = records[i]!.magG;
    if (Number.isFinite(magG) && magG < fluxSupplementMagLimit) {
      kept.add(i);
    }
  }

  // Return survivors in original input order (the invariant the downstream
  // cross-match dedup relies on), not Set insertion order.
  return Array.from(kept)
    .sort((a, b) => a - b)
    .map((i) => records[i]!);
}
