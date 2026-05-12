/**
 * VolumeFieldSettings — per-field runtime controls for one registered
 * scalar-volume field.
 *
 * Stored in `EngineSettingsState.volumes.fields` keyed by the same
 * handle string passed to `addVolumeField` / `removeVolumeField`.  The
 * engine seeds these at registration time (via `DEFAULT_VOLUME_FIELD_INTENSITY`)
 * and keeps them in sync with every `setVolumeFieldEnabled` /
 * `setVolumeFieldIntensity` call, so the SettingsPanel can read the
 * authoritative per-field state without polling the GPU handle.
 */

import type { ScalarFieldPaletteId } from '../data/ScalarFieldPaletteId';

export type VolumeFieldSettings = {
  /** When false, `scalarVolumeRenderer.setEnabled(handle, false)` silences this field. */
  enabled: boolean;
  /** Linear mix-in weight in [0, 1].  Seeded from `DEFAULT_VOLUME_FIELD_INTENSITY`. */
  intensity: number;
  /**
   * LUT-coordinate contrast around the 0.5 pivot (gamma-style remap).
   * 1.0 is identity; > 1.0 pushes mid-tones toward the saturated ends
   * of the palette (more visible structure for divergent palettes
   * centered on the cosmic mean); < 1.0 compresses toward the midpoint.
   * Orthogonal to `intensity`: intensity controls overall opacity,
   * contrast controls dynamic-range remapping.  Seeded from
   * `DEFAULT_VOLUME_FIELD_CONTRAST`.
   */
  contrast: number;
  /**
   * Per-cube opacity multiplier driving the scalar-volume shader's
   * alpha integral (`1 - exp(-densityScale * sample * step)`).  Seeded
   * at registration time from `VOLUME_FIELD_DEFAULTS[handle]`
   * (SCFD v2's per-handle registry; see
   * `src/data/volumeFieldDefaults.ts`) and mutated by
   * `setVolumeFieldDensityScale`.  Orthogonal to `intensity` (global
   * mix-in weight) and `contrast` (LUT-coordinate remap): density
   * tunes the optical-depth contribution per voxel-step, so it shifts
   * the balance between "transparent fog" and "saturated cloud"
   * without changing the colour ramp.  Falls back to
   * `DEFAULT_VOLUME_FIELD_DENSITY_SCALE` for unregistered handles.
   */
  densityScale: number;
  /**
   * Palette LUT id for this field.  Each volume field owns its own LUT
   * texture (see `scalarVolumeRenderer.ts`); this value mirrors the
   * renderer's per-field palette so the SettingsPanel dropdown can read
   * authoritative state without going through the GPU handle.  Seeded
   * from `VOLUME_FIELD_DEFAULTS[handle].paletteId` at registration time
   * (SCFD v2 cubes no longer carry palette themselves).
   */
  paletteId: ScalarFieldPaletteId;
  /**
   * User-tunable low-end cutoff in normalised LUT-coord space [0, 1].
   * Hard-suppresses voxels with deviation-from-center < trim — the
   * "Polyphorm trim_density" knob exposed in the SettingsPanel as a
   * Trim slider.  Seeded at registration from
   * `VOLUME_FIELD_DEFAULTS[handle].trim`; mutated by
   * `setVolumeFieldTrim`.
   */
  trim: number;
  /**
   * User-tunable HDR exposure multiplier on the rgb contribution per
   * ray-march step.  Combined with the shader's bright-end-weighted
   * formula (highlightGain = 1 + smoothstep(0.5, 1.0, dev) * (exposure - 1))
   * so mid-tones stay LDR-bounded while peaks blow out past the LUT's
   * brightest entry.  Seeded at registration from
   * `VOLUME_FIELD_DEFAULTS[handle].exposure`; mutated by
   * `setVolumeFieldExposure`.
   */
  exposure: number;
};
