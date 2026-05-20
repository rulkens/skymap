/**
 * subsampleByAbsMag — pure brightest-N cut by absolute magnitude.
 *
 * ### Why absolute, not apparent, magnitude?
 *
 * Apparent magnitude reflects "how bright does this galaxy look from Earth?",
 * which is dominated by distance for a deep flux-limited catalog like SDSS.
 * Cutting by apparent mag would drop intrinsically-luminous galaxies in the
 * back of the volume and keep nearby dwarfs — visually "the same field minus
 * its tail", which is exactly what we don't want.
 *
 * Absolute magnitude (M = m − 5·log10(d_Mpc) − 25) removes the distance
 * dependence, so a brightest-N cut is a *volume-limited* sample that keeps
 * the catalog's structural backbone intact.  Far massive galaxies stay; near
 * dwarfs go first.
 *
 * ### Why preserve input order in the output?
 *
 * The cross-match dedup downstream pipes `ParsedRecord[]` through a fixed
 * priority order; preserving the original index among the survivors keeps
 * dedup behaviour identical between tiers.  We sort an *index array* by
 * M_abs, take the first N indices, then sort *those* back by their original
 * positions — so the function is order-preserving among the kept records.
 *
 * ### Why drop non-finite records up front?
 *
 * Records with z ≤ 0 (distance undefined) or NaN apparent magnitude can't
 * have a meaningful M_abs.  Including them in the sort would put them at
 * either end depending on whether NaN propagates as larger-or-smaller in
 * v8's comparator (it's "undefined-ordered" — implementation-specific).
 * Filtering first is the only way to get deterministic output.
 *
 * @param records Array of parsed records.  Read-only — the input is not mutated.
 * @param target  Maximum number of records to keep.  ≥ records.length means
 *                "no cut".  0 returns [].  Negative targets are clamped to 0.
 * @returns       A fresh array of the brightest `target` records, in their
 *                original input order.  Records with non-finite mag or
 *                non-positive z are dropped regardless of target.
 */

import { absoluteMagnitude } from '../../src/utils/math/absoluteMagnitude.js';
import { redshiftToDistanceMpc } from '../../src/utils/math/redshiftToDistanceMpc.js';
import type { ParsedRecord } from '../parsers/common.js';

export function subsampleByAbsMag(records: ParsedRecord[], target: number): ParsedRecord[] {
  const kept = subsampleIndicesByAbsMag(records, target);
  return kept.map((i) => records[i]!);
}

/**
 * Variant of {@link subsampleByAbsMag} that returns the *indices* of the
 * kept records instead of the records themselves.  The output is sorted
 * in the same input order the regular variant preserves.
 *
 * ### Why a second entry point?
 *
 * Most sources flow straight from `ParsedRecord[]` into the binary
 * encoder, so the value-returning variant is all they need.  Milliquas
 * is different: alongside its records the parser emits parallel
 * `names[]` and `classes[]` arrays for a JSON sidecar.  Without access
 * to the kept indices, the only way to re-zip those arrays after a
 * subsample would be to duplicate the absolute-magnitude ranking logic
 * inline — which would silently drift if anyone tweaked the kept-set
 * heuristic.  Returning indices once and letting the caller re-zip every
 * sidecar shape it owns is the cheap, drift-proof factoring.
 *
 * Internally we delegate to the same ranking pass the value-returning
 * variant uses, so the two functions are guaranteed to agree on which
 * records survive a given (records, target) pair.
 */
export function subsampleIndicesByAbsMag(
  records: ParsedRecord[],
  target: number,
): number[] {
  if (target <= 0) return [];

  // Build (originalIdx, M_abs) tuples for records that have a finite M_abs.
  // NaN-rejected records are simply absent from this array, so they never
  // appear in the output regardless of target.
  const ranked: { idx: number; mAbs: number }[] = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    if (r.z <= 0 || !Number.isFinite(r.z)) continue;
    if (!Number.isFinite(r.magG)) continue;
    const d = redshiftToDistanceMpc(r.z);
    if (d <= 0 || !Number.isFinite(d)) continue;
    const m = absoluteMagnitude(r.magG, d);
    if (!Number.isFinite(m)) continue;
    ranked.push({ idx: i, mAbs: m });
  }

  // No cut needed if every survivor would be kept anyway.
  if (target >= ranked.length) {
    return ranked.map((e) => e.idx);
  }

  // Sort by brightness (smaller / more-negative M = brighter).  V8's
  // Array.prototype.sort is stable as of ES2019, so ties keep original order.
  ranked.sort((a, b) => a.mAbs - b.mAbs);

  // Keep the first `target`, then re-sort by original index so we return
  // survivors in input order (not brightness order).
  const kept = ranked.slice(0, target);
  kept.sort((a, b) => a.idx - b.idx);
  return kept.map((e) => e.idx);
}
