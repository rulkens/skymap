import type { StructureCatalog } from '../data/StructureCatalog';

/**
 * One entry of the `structures_meta.json` sidecar — the string/identity fields
 * that the numeric `.ccat` deliberately omits.  Position in the meta array
 * equals the record's localIdx in the parallel `.ccat`, so the runtime can
 * look up a clicked structure's human-readable label by the index the
 * pick-renderer returns.
 *
 * Shape mirrors what `tools/structures/buildStructures.ts` writes via its `toMeta`
 * mapping: `{ id, names, abell, description }` with `abell` a nullable string
 * (null for superclusters and any cluster lacking an Abell/ACO designation).
 * The build's own meta type is local + unexported, so this is the canonical
 * runtime mirror — keep the two in lock-step.
 */
export type StructureMetaEntry = {
  /** URL-safe slug of names[0] — the localIdx lookup key. */
  id: string;
  /** Display names; names[0] is the primary label. */
  names: string[];
  /** Normalized Abell/ACO designation (e.g. 'A2670'), or null. */
  abell: string | null;
  /** One-liner shown in the POI info panel. */
  description: string;
};

/**
 * The decoded structure-catalog asset: the numeric `.ccat` catalog paired with
 * its string sidecar.  The two are built in lock-step and index-parallel —
 * `catalog.count === meta.length` is an invariant the fetcher enforces — so a
 * later merge step can attach names + descriptions to each record by localIdx.
 */
export type StructureCatalogPayload = {
  catalog: StructureCatalog;
  meta: readonly StructureMetaEntry[];
};
