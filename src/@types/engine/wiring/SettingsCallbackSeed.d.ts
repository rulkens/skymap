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
import type { LodMode } from '../../data/LodMode';

export type SettingsCallbackSeed = {
  pointSize: number;
  brightness: number;
  autoRotate: boolean;
  galaxyTexturesEnabled: boolean;
  highlightFallback: boolean;
  realOnlyMode: boolean;
  depthFadeEnabled: boolean;
  biasMode: BiasMode;
  absMagLimit: number;
  toneMapCurve: ToneMapCurve;
  exposure: number;
  lodMode: LodMode;
  visibleSourceMask: number;
};
