/**
 * VolumeFieldRowData — the data the SettingsPanel needs to render a
 * single volume-field row.
 *
 * Projected from `state.settings.volumes.items` by `projectVolumeFieldRows`
 * (and its `EngineState` adapter `buildVolumeFieldsSnapshot`).  App reads the
 * items Record off the engine-owned store via `selectVolumeFieldItems` and runs
 * that projection in a `useMemo`, so the panel always reflects the live field
 * registry.  Also returned by `engineHandle.volumes.getState()` for one-shot
 * reads (dev console, tests).
 *
 * The `label` field defaults to the `id` string: `addVolumeField`'s payload
 * is just the id, so no field is registered with an explicit human-readable
 * name today.
 *
 * ### Why this lives in @types rather than the component folder
 *
 * The `.tsx` carve-out (component-only types stay co-located with
 * their `.tsx`) does NOT apply here because `projectVolumeFieldRows`
 * — outside `components/` — also produces this type.  Living in
 * `@types/settings/` lets the SettingsPanel, the projection, and the
 * engine snapshot deep-import a single source of truth.
 */

import type { ScalarFieldPaletteId } from '../data/volume/ScalarFieldPaletteId';
import type { VolumeFieldId } from '../data/volume/VolumeFieldId';

export type VolumeFieldRowData = {
  /** Stable id matching the field registered via `addVolumeField`. */
  id: VolumeFieldId;
  /** Human-readable display name; defaults to the id if not provided. */
  label: string;
  /** Whether this field is currently included in the render pass. */
  enabled: boolean;
  /** Linear mix-in weight in [0, 1] applied to this field's voxel values. */
  intensity: number;
  /**
   * Contrast for the per-step windowing transform in the scalar-volume
   * shader.  1.0 is identity; > 1.0 widens the deadband around the
   * midpoint and stretches the surviving range across the full
   * palette.  See `VolumeFieldSettings.contrast`.
   */
  contrast: number;
  /**
   * Per-cube opacity multiplier (densityScale).  Surfaced for the
   * per-field Density slider so users can compensate for windowing's
   * noise suppression or shape a very thin / very dense field.
   */
  densityScale: number;
  /** Palette LUT id for this field's colour ramp. */
  paletteId: ScalarFieldPaletteId;
  /**
   * Low-end cutoff in normalised LUT-coord space [0, 0.95].  Drives
   * the per-cube Trim slider.  See `VolumeFieldSettings.trim`.
   */
  trim: number;
  /**
   * HDR exposure multiplier on rgb contribution per ray-march step,
   * range [1, 32].  Drives the per-cube Exposure slider.  See
   * `VolumeFieldSettings.exposure`.
   */
  exposure: number;
};
