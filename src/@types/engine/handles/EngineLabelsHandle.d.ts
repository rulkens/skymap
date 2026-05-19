/**
 * EngineLabelsHandle — public-handle sub-bag for the POI overlay
 * (clusters / superclusters / voids / famous galaxies).
 *
 * Despite the name "labels", this handle exposes setters for BOTH the
 * text-label axis AND the marker (ring + halo) axis of POI rendering.
 * The two axes are deliberately independent — see the docblock on
 * `poiSubsystem.ts` for the 2026-05-19 audit (Q11) decision that split
 * them.  The handle name pre-dates the split; the Settings-panel
 * restructure (Task #6 of that audit) is the natural moment to rename
 * the namespace if the project decides to.
 */

import type { PoiCategory } from '../../../services/engine/subsystems/poiSubsystem';

export type EngineLabelsHandle = {
  /**
   * Show/hide the TEXT LABEL for every POI in the given category.
   * Forwards to
   * `state.subsystems.pois.setCategoryLabelVisible(category, visible)`.
   * Echoes back via `onLabelCategoryVisibilityChange` with the full
   * label-visibility record so the React shell can keep its checkboxes
   * in sync from one callback.
   *
   * Marker (ring + halo) visibility for the same category is untouched
   * — use `setCategoryMarkerVisible` for that axis.
   */
  setCategoryLabelVisible(category: PoiCategory, visible: boolean): void;
  /**
   * Show/hide the MARKER (ring + halo) for every POI in the given
   * category.  Forwards to
   * `state.subsystems.pois.setCategoryMarkerVisible(category, visible)`.
   * Echoes back via `onMarkerCategoryVisibilityChange` with the full
   * marker-visibility record.
   *
   * Today the Structures master toggle (Task #6) is the only intended
   * consumer; there is currently no per-category marker UI.  Label
   * visibility for the same category is untouched — use
   * `setCategoryLabelVisible` for that axis.
   */
  setCategoryMarkerVisible(category: PoiCategory, visible: boolean): void;
};
