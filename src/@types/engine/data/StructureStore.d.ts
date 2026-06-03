import type { StructureRecord } from './StructureRecord';
import type { StructureGroupId } from './StructureGroupId';
import type { StructureCategory } from './StructureCategory';

/**
 * StructureStore — the authoritative app-side home for extended-structure
 * data (clusters / superclusters / voids), both the curated featured
 * anchors and the bulk catalog.
 *
 * Replaces the pre-store split where structures lived across
 * `state.sources.clusterBulk`, the `poiSubsystem`'s merged list, and the
 * static-anchor seed. Records arrive in keyed groups (`anchors` / `bulk`);
 * `all()` concatenates them in a fixed `anchors` → `bulk` order, which
 * preserves the ring pick-path's `instance_index → byCategory(...)[idx]`
 * alignment (carried over from the old `PoiGroupId` ordering contract).
 *
 * Marker and label visibility are two independent per-category axes: a
 * category's ring can be hidden while its label still renders, and vice
 * versa. Both default to visible.
 *
 * Famous galaxies are deliberately NOT held here — they are galaxy data
 * (`GalaxyStore`); their label is produced from there.
 */
export type StructureStore = {
  /** Install (replacing) the records for one group. A defensive copy is taken. */
  setGroup(id: StructureGroupId, records: readonly StructureRecord[]): void;
  /** Remove a group; other groups are unaffected. */
  clearGroup(id: StructureGroupId): void;
  /** All records, concatenated in `anchors` → `bulk` order. */
  all(): readonly StructureRecord[];
  /** Resolve a record by id across all groups, or null. */
  byId(id: string): StructureRecord | null;
  /** Records of one category, in `all()` order (pick-index alignment). */
  byCategory(category: StructureCategory): readonly StructureRecord[];
  /** Whether the ring/halo marker for a category is visible (default true). */
  markerVisible(category: StructureCategory): boolean;
  /** Whether the text label for a category is visible (default true). */
  labelVisible(category: StructureCategory): boolean;
  /** Set the marker visibility for a category. */
  setMarkerVisible(category: StructureCategory, visible: boolean): void;
  /** Set the label visibility for a category. */
  setLabelVisible(category: StructureCategory, visible: boolean): void;
};
