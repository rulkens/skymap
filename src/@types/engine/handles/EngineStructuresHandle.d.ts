/**
 * EngineStructuresHandle — public-handle sub-bag for the structure overlay
 * (clusters / superclusters / voids / groups).
 *
 * A structure category has two independently-toggled axes: the ring/marker
 * glyph drawn at its world anchor, and the floating text label. The two
 * setters here drive those axes onto the authoritative `settings.structures.items`
 * row — keyed by `StructureCategory` because only structures bear rings (famous
 * galaxies, which bear labels but no ring, route through `EngineSurveysHandle`).
 * Each setter echoes back a fresh derived visibility record so the React shell
 * keeps its checkboxes in sync from one callback.
 */

import type { StructureCategory } from '../data/StructureCategory';

export type EngineStructuresHandle = {
  /** Show/hide the RING (marker + halo) for every structure in the category. */
  setItemEnabled(category: StructureCategory, enabled: boolean): void;
  /** Show/hide the TEXT LABEL for every structure in the category. */
  setLabelEnabled(category: StructureCategory, enabled: boolean): void;
};
