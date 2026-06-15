import type { StructureInfo } from '../../data/structure/StructureInfo';
import type { StructureGroupId } from '../../data/structure/StructureGroupId';
import type { StructureCategory } from '../../data/structure/StructureCategory';

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
 * FadeRegistry as `markerLayer` / `labelLayer` handles, so the producers read
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
  byCategory(category: StructureCategory): readonly StructureInfo[];
};
