import type { StructureInfo } from '../../data/structure/StructureInfo';
import type { StructureGroupId } from '../../data/structure/StructureGroupId';
import type { StructureId } from '../../data/structure/StructureId';

/**
 * StructureStore — the authoritative app-side home for extended-structure
 * data (clusters / superclusters / voids), both the curated featured
 * anchors and the bulk catalog.
 *
 * The single authoritative home for structure records. They arrive in keyed
 * groups (`anchors` for the curated featured seed, `bulk` for the catalog);
 * `all()` concatenates them in a fixed `anchors` → `bulk` order, which
 * preserves the ring pick-path's `instance_index → byCategory(...)[idx]`
 * alignment that pick-index decode requires.
 *
 * Per-category marker/label VISIBILITY is not a store concern: it lives in the
 * FadeRegistry as `structure` / `labelLayer` handles, so the producers read
 * the same animated opacity the rings fade through. The store holds records
 * only.
 *
 * Famous galaxies are deliberately NOT held here — they are galaxy data
 * (`GalaxyStore`); their label is produced from there.
 */
export type StructureStore = {
  /** Install (replacing) the records for one group. A defensive copy is taken. */
  setGroup(id: StructureGroupId, records: readonly StructureInfo[]): void;
  /** Remove a group; other groups are unaffected. */
  clearGroup(id: StructureGroupId): void;
  /** All records, concatenated in `anchors` → `bulk` order. */
  all(): readonly StructureInfo[];
  /** Resolve a record by id across all groups, or null. */
  byId(id: string): StructureInfo | null;
  /** Records of one category, in `all()` order (pick-index alignment). */
  byCategory(category: StructureId): readonly StructureInfo[];
  /**
   * A record's position within `byCategory(category)` — the single source
   * for "which per-category index does this structure occupy", so the ring
   * pick-index decode and a structure's own label pick-id stamp can't drift
   * apart into two independent counts. -1 if `id` isn't in that category.
   */
  categoryIndexOf(category: StructureId, id: string): number;
};
