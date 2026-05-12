/**
 * VolumeFieldRowData — the data the SettingsPanel needs to render a
 * single volume-field row.
 *
 * Produced by `engineHandle.volumes.getState()` and held in App.tsx
 * React state; rebuilt on every `onVolumeFieldsChanged` callback so the
 * panel always reflects the live field registry without a full re-render
 * of the engine.
 *
 * The `label` field defaults to the `handle` string when the field was
 * registered without an explicit human-readable name.  A future
 * `addVolumeField({ handle, label, ... })` API would populate it from
 * caller metadata.
 *
 * ### Why this lives in @types rather than the component folder
 *
 * The `.tsx` carve-out (component-only types stay co-located with
 * their `.tsx`) does NOT apply here because `useEngineSettings.ts`
 * — outside `components/` — also consumes this type.  Moving it into
 * `@types/settings/` lets both the SettingsPanel and the hook
 * deep-import a single source of truth.
 */

import type { ScalarFieldPaletteId } from '../data/ScalarFieldPaletteId';

export type VolumeFieldRowData = {
  /** Stable key matching the handle passed to `addVolumeField`. */
  handle: string;
  /** Human-readable display name; defaults to the handle if not provided. */
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
