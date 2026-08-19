import type { ScalarCube } from '../../data/volume/ScalarCube';
import type { ScalarFieldPaletteId } from '../../data/volume/ScalarFieldPaletteId';
import type { VolumeFieldId } from '../../data/volume/VolumeFieldId';

/**
 * EngineVolumesHandle — scalar-volume overlay registry.
 *
 * `add` / `remove` mint and unmint cube registrations — the entry point for
 * runtime-supplied cubes the demand system cannot express (no URL, not in
 * the registry). They execute the _same_ `uploadVolumeField`/
 * `unloadVolumeField` the volume slot commits do, so there is no second
 * ingest path.  Per-field tunable writes (enabled, intensity, contrast,
 * densityScale, trim, exposure, palette) and the master enabled gate now
 * dispatch directly through the store.
 *
 * The spherical envelope is per-cube static presentation config, read
 * once from the registry by the renderer's `upload` — it is not a
 * user-tunable control and is therefore not exposed here.
 */
export type EngineVolumesHandle = {
  /** Register a new scalar-volume field from a decoded ScalarCube. */
  add: (id: VolumeFieldId, cube: ScalarCube) => void;
  /** Unregister a field and release its GPU resources. */
  remove: (id: VolumeFieldId) => void;
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
