import type { StructureId } from '../data/structure/StructureId';

/**
 * Lean projection of a `StructureInfo` for the command palette's structure
 * search.  The store's record carries render-only fields (worldPos,
 * significance, radii) the palette never reads, and the palette is a pure view
 * that shouldn't depend on the engine's data union — so `useStructureIndex`
 * maps each `StructureInfo` down to just the searchable + displayable parts,
 * parallel to how `AliasIndexEntry` is a lean join over a galaxy cloud.
 *
 * `id` is the durable `${category}-${seedId}` (or `${category}-bulk-${id}`)
 * focus id that `resolveFocusId` accepts and `structures.byId` resolves — the
 * palette emits it verbatim through `requestFocus`.
 */
export type StructureSearchEntry = {
  /** Durable `#focus=<id>` string — resolves to the structure via the saga. */
  readonly id: string;
  /** Primary display name (e.g. 'Coma Cluster', 'A2703'). */
  readonly name: string;
  /** Structure sub-kind — drives the row's category chip. */
  readonly category: StructureId;
  /** Abell/ACO designation where known (clusters only), else null — searchable. */
  readonly abell: string | null;
  /** One-liner blurb — searchable as a last-resort fallback. */
  readonly description: string;
};
