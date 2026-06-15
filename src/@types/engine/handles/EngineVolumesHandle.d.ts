import type { ScalarCube } from '../../data/volume/ScalarCube';
import type { ScalarFieldPaletteId } from '../../data/volume/ScalarFieldPaletteId';
import type { VolumeFieldId } from '../../data/volume/VolumeFieldId';

/**
 * EngineVolumesHandle — scalar-volume overlay registry + per-field tunables.
 *
 * `add` / `remove` mint and unmint cube registrations.  `setMasterEnabled`
 * is the coarse "hide all volumes" gate.  The per-field setters take the
 * `VolumeFieldId` of the target field — a closed union derived from
 * `SOURCE_REGISTRY`, so unregistered handles are a type error.
 *
 * `list` / `getState` are the read-side methods the SettingsPanel uses
 * to render per-field rows.
 *
 * The spherical envelope is per-cube static presentation config, read
 * once from the registry by the renderer's `upload` — it is not a
 * user-tunable control and is therefore not exposed here.
 */
export type EngineVolumesHandle = {
  /** Master gate for the entire scalar-volume overlay. */
  setMasterEnabled: (enabled: boolean) => void;
  /** Register a new scalar-volume field from a decoded ScalarCube. */
  add: (id: VolumeFieldId, cube: ScalarCube) => void;
  /** Unregister a field and release its GPU resources. */
  remove: (id: VolumeFieldId) => void;
  /** Gate a single registered field on or off without unloading. */
  setEnabled: (id: VolumeFieldId, enabled: boolean) => void;
  /** Set the linear mix-in intensity for a single field, in [0, 1]. */
  setIntensity: (id: VolumeFieldId, intensity: number) => void;
  /** Set the contrast-windowing strength for a single field (>=0). */
  setContrast: (id: VolumeFieldId, contrast: number) => void;
  /** Set the per-cube opacity multiplier (alpha integral coefficient). */
  setDensityScale: (id: VolumeFieldId, value: number) => void;
  /**
   * Set the user-tunable low-end Trim cutoff for a single field, in
   * normalised LUT-coord space [0, 0.95].  Hard-suppresses voxels with
   * deviation-from-center less than `trim` — exposed in the
   * SettingsPanel as a Trim slider per cube.
   */
  setTrim: (id: VolumeFieldId, trim: number) => void;
  /**
   * Set the user-tunable HDR Exposure multiplier on the rgb
   * contribution per ray-march step for a single field, range [1, 32].
   * Combined with the shader's bright-end-weighted formula
   * (highlightGain = 1 + smoothstep(0.5, 1.0, dev) * (exposure - 1))
   * so peaks brighten (white blow-out) without washing out the
   * mid-tone gradient.  Exposed in the SettingsPanel as an Exposure
   * slider per cube.
   */
  setExposure: (id: VolumeFieldId, exposure: number) => void;
  /** Set the palette LUT id for a single field. */
  setPalette: (id: VolumeFieldId, paletteId: ScalarFieldPaletteId) => void;
  /** Return the ordered list of currently registered field ids. */
  list: () => VolumeFieldId[];
  /** Return a snapshot of every registered field's UI-facing state. */
  getState: () => ReadonlyArray<{
    id: VolumeFieldId;
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
