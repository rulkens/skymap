/**
 * EngineLabelsHandle — public-handle sub-bag for the famous-galaxy text label.
 *
 * Structure rings and structure labels live on `EngineStructuresHandle`; what
 * remains here is the curated-atlas label axis. The setter is keyed by
 * `LabelCategory` (rather than narrowing to `'famousGalaxy'`) so the call stays
 * registry-driven: it routes by the source's `labelLayer` row, and a structure
 * category passed in still resolves to the structure label axis. In practice
 * the panel routes structure label rows to `EngineStructuresHandle` directly,
 * so the only live caller here is the famous-galaxy toggle.
 */

import type { LabelCategory } from '../data/LabelCategory';

export type EngineLabelsHandle = {
  /**
   * Show/hide the TEXT LABEL for the given label category. Drives the
   * famous-galaxy `galaxyNames` layer (the curated atlas), echoing back via
   * `onLabelCategoryVisibilityChange` with the full label-visibility record so
   * the React shell keeps its checkboxes in sync from one callback.
   */
  setCategoryLabelVisible(category: LabelCategory, visible: boolean): void;
};
