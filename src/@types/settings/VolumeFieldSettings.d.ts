/**
 * VolumeFieldSettings — per-field runtime controls for one registered
 * scalar-volume field.
 *
 * Held in `state.settings.volumes.items`, keyed by `VolumeFieldId`.
 * The engine seeds these at construction from the field's SOURCE_REGISTRY
 * entry; the SettingsPanel reads authoritative state directly from settings
 * without polling the GPU handle.
 *
 * Extends `DataItemSettings` so a volume field's on/off lives in the same
 * `enabled` field every other data item uses (`volumeFieldRenderer.setEnabled`
 * reads it when false). The per-field render knobs below ride on top — they're
 * what makes a scalar-volume field richer than a galaxy catalog or structure item,
 * which carry only visibility (and an optional label axis).
 */

import type { DataItemSettings } from './DataItemSettings';
import type { ScalarFieldPaletteId } from '../data/volume/ScalarFieldPaletteId';
import type { FadeBand } from '../math/FadeBand';

export type VolumeFieldSettings = DataItemSettings & {
  /** Linear mix-in weight in [0, 1].  Seeded from `DEFAULT_VOLUME_FIELD_INTENSITY`. */
  intensity: number;
  /**
   * LUT-coordinate contrast around the 0.5 pivot (gamma-style remap).
   * 1.0 is identity; > 1.0 pushes mid-tones toward the saturated ends
   * of the palette (more visible structure for divergent palettes
   * centered on the cosmic mean); < 1.0 compresses toward the midpoint.
   * Orthogonal to `intensity`: intensity controls overall opacity,
   * contrast controls dynamic-range remapping.
   */
  contrast: number;
  /**
   * Per-cube opacity multiplier driving the scalar-volume shader's
   * alpha integral (`1 - exp(-densityScale * sample * step)`).
   * Orthogonal to `intensity` (global mix-in weight) and `contrast`
   * (LUT-coordinate remap): density tunes optical-depth contribution
   * per voxel-step, so it shifts the balance between "transparent fog"
   * and "saturated cloud" without changing the colour ramp.
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
   * User-tunable low-end cutoff in normalised LUT-coord space [0, 1].
   * Hard-suppresses voxels with deviation-from-center < trim — the
   * "Polyphorm trim_density" knob exposed in the SettingsPanel as a
   * Trim slider.
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
  /**
   * Scale-fade bands multiplied into this field's opacity by
   * `deriveVolumeLiveness` (`fadeOpacityOf`), keyed on camera distance from
   * the heliocentric render origin. Values, not band names, so a field's
   * choreography is tunable via `writeVolumeField` without touching code.
   * Seeded from the registry's `fadeBands` (`buildVolumeFieldSettings`);
   * a stale row missing this falls back to `[SCALE_FADE_BANDS.surveyDeepZoom]`
   * at the `clampVolumeFieldSettings` read edge.
   */
  bands: readonly FadeBand[];
};
