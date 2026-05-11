import type { ScalarCube, ScalarFieldPaletteId } from './ScalarCube';

/**
 * EngineVolumesHandle — scalar-volume overlay registry + per-field tunables.
 *
 * `add`/`remove` mint and unmint cube registrations.  `setMasterEnabled`
 * is the coarse "hide all volumes" gate.  The per-field setters take a
 * handle string for the field they target.  `list` / `getState` are the
 * read-side methods the SettingsPanel uses to render per-field rows.
 *
 * The spherical-envelope control (`scalarVolumeRenderer.setEnvelope`)
 * is intentionally NOT exposed here — envelopes are registry-driven via
 * `VolumeFieldDefaults` keyed by handle; runtime UI tweaking would be
 * surprising for a content property.
 */
export type EngineVolumesHandle = {
  /** Master gate for the entire scalar-volume overlay. */
  setMasterEnabled: (enabled: boolean) => void;
  /** Register a new scalar-volume field from a decoded ScalarCube. */
  add: (handle: string, cube: ScalarCube) => void;
  /** Unregister a field and release its GPU resources. */
  remove: (handle: string) => void;
  /** Gate a single registered field on or off without unloading. */
  setEnabled: (handle: string, enabled: boolean) => void;
  /** Set the linear mix-in intensity for a single field, in [0, 1]. */
  setIntensity: (handle: string, intensity: number) => void;
  /** Set the contrast-windowing strength for a single field (>=0). */
  setContrast: (handle: string, contrast: number) => void;
  /** Set the per-cube opacity multiplier (alpha integral coefficient). */
  setDensityScale: (handle: string, value: number) => void;
  /**
   * Set the user-tunable low-end Trim cutoff for a single field, in
   * normalised LUT-coord space [0, 0.95].  Hard-suppresses voxels with
   * deviation-from-center less than `trim` — exposed in the
   * SettingsPanel as a Trim slider per cube.
   */
  setTrim: (handle: string, trim: number) => void;
  /**
   * Set the user-tunable HDR Exposure multiplier on the rgb
   * contribution per ray-march step for a single field, range [1, 32].
   * Combined with the shader's bright-end-weighted formula
   * (highlightGain = 1 + smoothstep(0.5, 1.0, dev) * (exposure - 1))
   * so peaks brighten (white blow-out) without washing out the
   * mid-tone gradient.  Exposed in the SettingsPanel as an Exposure
   * slider per cube.
   */
  setExposure: (handle: string, exposure: number) => void;
  /** Set the palette LUT id for a single field. */
  setPalette: (handle: string, id: ScalarFieldPaletteId) => void;
  /** Return the ordered list of currently registered field handles. */
  list: () => string[];
  /** Return a snapshot of every registered field's UI-facing state. */
  getState: () => ReadonlyArray<{
    handle: string;
    label: string;
    enabled: boolean;
    intensity: number;
    contrast: number;
    densityScale: number;
    paletteId: ScalarFieldPaletteId;
    trim: number;
    exposure: number;
  }>;
};
