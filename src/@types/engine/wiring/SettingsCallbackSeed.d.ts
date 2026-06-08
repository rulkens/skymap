/**
 * SettingsCallbackSeed — snapshot of every settings value the engine
 * echoes back to React at startup via `seedSettingsCallbacks`.
 *
 * (Originally named `Snapshot`; renamed during the PR-8 types
 * consolidation to disambiguate it from the GenerationCounter
 * "snapshot" concept used elsewhere.)
 *
 * Adding a new setting?  Add the field here, add the matching
 * `cb.onXChange?.()` line in `seedSettingsCallbacks`, and extend the
 * test in `tests/services/engine/seedSettingsCallbacks.test.ts`.
 */

import type { BiasMode } from '../../data/BiasMode';
import type { ToneMapCurve } from '../../data/ToneMapCurve';
import type { LabelCategory } from '../data/LabelCategory';
import type { StructureCategory } from '../data/StructureCategory';

export type SettingsCallbackSeed = {
  pointSize: number;
  brightness: number;
  autoRotate: boolean;
  galaxyTexturesEnabled: boolean;
  highlightFallback: boolean;
  realOnlyMode: boolean;
  depthFadeEnabled: boolean;
  showPickBuffer: boolean;
  showDiskRadiusRing: boolean;
  biasMode: BiasMode;
  absMagLimit: number;
  toneMapCurve: ToneMapCurve;
  exposure: number;
  visibleSourceMask: number;
  /**
   * Initial per-category label visibility — fired through
   * `cb.labels?.onLabelCategoryVisibilityChange?.(...)` so the React
   * shell seeds its label checkboxes from engine truth on startup.
   */
  labelCategoryVisibility: Readonly<Record<LabelCategory, boolean>>;
  /**
   * Initial per-category MARKER visibility — fired through
   * `cb.labels?.onMarkerCategoryVisibilityChange?.(...)`.  Keyed by
   * `StructureCategory` only (no ring marker for famous galaxies);
   * independent axis from the label record; defaults to every category
   * visible.
   */
  markerCategoryVisibility: Readonly<Record<StructureCategory, boolean>>;
};
