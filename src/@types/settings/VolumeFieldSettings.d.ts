/**
 * VolumeFieldSettings — per-field runtime controls for one registered
 * scalar-volume field.
 *
 * Held in `state.settings.cosmicWebDensity.items`, keyed by `CosmicWebDensityFieldId`.
 * The engine seeds these at construction from the field's APP_SOURCE_REGISTRY
 * entry; the SettingsPanel reads authoritative state directly from settings
 * without polling the GPU handle.
 *
 * Extends `DataItemSettings` so a volume field's on/off lives in the same
 * `enabled` field every other data item uses (the renderer's `hasActiveFields`
 * reads it). The per-field render knobs below ride on top — they're
 * what makes a scalar-volume field richer than a galaxy catalog or structure item,
 * which carry only visibility (and an optional label axis).
 */

import type { DataItemSettings } from './DataItemSettings';
import type { ScalarFieldPaletteId } from '../data/volume/ScalarFieldPaletteId';

export type VolumeFieldSettings = DataItemSettings & {
  /** Linear mix-in weight in [0, 1].  Seeded by the owning Layer's `initialState` literal. */
  intensity: number;
  /**
   * Width of the deadband-and-stretch window (`applyContrastWindow` in
   * `fragment.wesl`): samples within 1 − 1/contrast of the field's
   * contrast centre are hidden, the rest stretched over the palette.
   * 1.0 is identity. Orthogonal to `intensity`: intensity controls
   * overall opacity, contrast hides the noise floor.
   */
  contrast: number;
  /**
   * Per-cube opacity multiplier in the shader's per-step alpha,
   * `lut.a · intensity · densityScale · stepLength`. Orthogonal to
   * `intensity` (global mix-in weight) and `contrast` (the window):
   * it shifts the balance between "transparent fog" and "saturated
   * cloud" without changing the colour ramp.
   */
  densityScale: number;
  /**
   * Palette LUT id for this field.  This is the AUTHORITATIVE palette
   * setting; the renderer tracks what's currently uploaded via its own
   * `residentPaletteId` and re-uploads the LUT when this setting diverges
   * from the resident value.
   */
  paletteId: ScalarFieldPaletteId;
  /**
   * Extra low-end cut in [0, 0.95], applied above the contrast deadband:
   * the fraction of the surviving deviation range that is hard-suppressed.
   * 0 leaves the contrast deadband alone. The Trim slider.
   */
  trim: number;
  /**
   * User-tunable HDR exposure multiplier on the rgb contribution per
   * ray-march step.  Combined with the shader's bright-end-weighted
   * formula (highlightGain = 1 + smoothstep(0.5, 1.0, dev) * (exposure - 1))
   * so mid-tones stay LDR-bounded while peaks blow out past the LUT's
   * brightest entry.
   */
  exposure: number;
};
