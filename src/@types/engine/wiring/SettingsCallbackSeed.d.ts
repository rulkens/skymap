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
import type { PoiCategory } from '../../../services/engine/subsystems/poiSubsystem';

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
   * Initial per-category POI label visibility — fired through
   * `cb.labels?.onLabelCategoryVisibilityChange?.(...)` so the React
   * shell seeds its label checkboxes from engine truth on startup.
   */
  labelCategoryVisibility: Readonly<Record<PoiCategory, boolean>>;
  /**
   * Initial per-category POI MARKER visibility — fired through
   * `cb.labels?.onMarkerCategoryVisibilityChange?.(...)`.  Independent
   * axis from the label record; defaults to every category visible.
   */
  markerCategoryVisibility: Readonly<Record<PoiCategory, boolean>>;
};
