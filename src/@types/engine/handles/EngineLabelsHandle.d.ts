/**
 * EngineLabelsHandle — public-handle sub-bag for the structure overlay
 * (clusters / superclusters / voids / famous galaxies).
 *
 * Despite the name "labels", this handle exposes setters for BOTH the
 * text-label axis AND the marker (ring + halo) axis of structure rendering.
 * The two axes are deliberately independent: a category's marker can be
 * hidden while its text label still renders, and vice versa.
 */

import type { LabelCategory } from '../data/LabelCategory';
import type { StructureCategory } from '../data/StructureCategory';

export type EngineLabelsHandle = {
  /**
   * Show/hide the TEXT LABEL for every source in the given label
   * category.  Forwards to
   * `state.subsystems.structures.setCategoryLabelVisible(category, visible)`.
   * Echoes back via `onLabelCategoryVisibilityChange` with the full
   * label-visibility record so the React shell can keep its checkboxes
   * in sync from one callback.
   *
   * Marker (ring + halo) visibility for the same category is untouched
   * — use `setCategoryMarkerVisible` for that axis.
   */
  setCategoryLabelVisible(category: LabelCategory, visible: boolean): void;
  /**
   * Show/hide the MARKER (ring + halo) for every structure in the given
   * category.  Keyed by `StructureCategory` only: famous galaxies bear
   * no ring marker.  Forwards to
   * `state.subsystems.structures.setCategoryMarkerVisible(category, visible)`.
   * Echoes back via `onMarkerCategoryVisibilityChange` with the full
   * marker-visibility record.
   *
   * Today the Structures master toggle is the only intended consumer;
   * there is currently no per-category marker UI.  Label visibility for
   * the same category is untouched — use `setCategoryLabelVisible` for
   * that axis.
   */
  setCategoryMarkerVisible(category: StructureCategory, visible: boolean): void;
};
