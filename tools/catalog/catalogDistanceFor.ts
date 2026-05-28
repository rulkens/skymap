/**
 * Resolve a redshift-independent catalog distance for one ParsedRecord.
 *
 * Lookup order:
 *   1. CF4 by PGC (`record.objID`).
 *   2. HyperLEDA `mod0` distance modulus by PGC.
 *   3. null (caller falls back to the cz-derived position).
 *
 * Pure function — no I/O, no closures over module state. The build
 * pipeline calls this once per `ParsedRecord` in `recordsToCloud` with
 * the same two pre-built indices.
 *
 * Why pre-built indices rather than the raw arrays? The lookup runs
 * ~3M times per build and a linear scan over CF4's 55k rows would
 * dominate the build time. Map.get() is O(1).
 *
 * ## Why PGC-only (no 2MASS XSC, no cone-match)
 *
 * The original spec floated a 2MASS-XSC fallback for 2MRS rows whose
 * `objID` is the 2MASS integer rather than a PGC. That fallback was
 * always dead code: CF4 table2.dat lists PGC as its sole cross-match
 * identifier, with no 2MASS XSC column at all (verified against the
 * 2026-05-27 ReadMe). The 2MRS → CF4 path therefore goes through the
 * existing `2MASX → PGC` patching step in `buildAllBins` (which uses
 * GLADE as the cross-walk source), not through a separate 2MASS-keyed
 * index here.
 *
 * Cone-matching (the spec's "1-arcmin fallback") is deferred. The CF4
 * parser still extracts RA/Dec into `Cf4Record`, so adding a cone
 * fallback later means a localised change to this function — no
 * re-parse, no new index.
 */
import type { Cf4CatalogIndex } from '../parsers/cosmicflows4';
import type { HyperLedaShapeMap } from '../parsers/glade';
import type { ParsedRecord } from '../parsers/common';

export type CatalogDistance = {
  distMpc: number;
  /** Provenance of the chosen distance — surfaced for InfoCard provenance chips. */
  source: 'cf4' | 'hyperleda';
};

/** Convert HyperLEDA `mod0` distance modulus to Mpc. NaN → null. */
function hyperLedaModToMpc(mod0: number): number | null {
  if (!Number.isFinite(mod0)) return null;
  return Math.pow(10, (mod0 - 25) / 5);
}

export function catalogDistanceFor(
  record: ParsedRecord,
  cf4: Cf4CatalogIndex,
  hyperLeda: HyperLedaShapeMap,
): CatalogDistance | null {
  // No PGC → no lookup possible. (objID == 0n is the convention for
  // "this record has no SDSS/PGC cross-walk".)
  if (record.objID === 0n) return null;
  const pgc = Number(record.objID);
  if (!Number.isFinite(pgc)) return null;

  // Step 1: CF4 by PGC.
  const cf4Hit = cf4.byPgc.get(pgc);
  if (cf4Hit !== undefined) {
    return { distMpc: cf4Hit.distMpc, source: 'cf4' };
  }

  // Step 2: HyperLEDA mod0 fallback.
  // The HyperLEDA shape map keys by stringified PGC (set via
  // `out.set(pgc.trim(), …)` in tools/parsers/glade.ts) rather than
  // numeric PGC, so we look up by string.
  const ledaHit = hyperLeda.get(String(pgc));
  if (ledaHit !== undefined) {
    const distMpc = hyperLedaModToMpc(ledaHit.mod0);
    if (distMpc !== null) return { distMpc, source: 'hyperleda' };
  }

  return null;
}
