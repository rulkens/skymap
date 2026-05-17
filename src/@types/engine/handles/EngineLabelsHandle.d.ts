/**
 * EngineLabelsHandle — public-handle sub-bag for the POI label overlay.
 *
 * Mirror of `EngineThumbnailsHandle`'s shape; the only knob today is
 * per-category visibility, but the handle is its own sub-bag so the
 * React shell's `handle.labels.setCategoryVisible(...)` call site
 * stays cohesive with the other Overlays sub-handles (thumbnails,
 * milkyWay, filaments).
 */

import type { PoiCategory } from '../../../services/engine/subsystems/poiSubsystem';

export type EngineLabelsHandle = {
  /**
   * Show/hide every POI in the given category.  Forwards to
   * `state.subsystems.pois.setCategoryVisible(category, visible)`.
   * Echoes back via `onCategoryVisibilityChange` with the full
   * visibility record so the React shell can keep all four checkboxes
   * in sync from one callback.
   */
  setCategoryVisible(category: PoiCategory, visible: boolean): void;
};
