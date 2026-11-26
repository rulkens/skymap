import type { SourceEntryBase } from '../SourceEntryBase';
import type { VolumeFieldDefaults } from './VolumeFieldDefaults';

/**
 * Volume-typed row of the APP_SOURCE_REGISTRY — scalar-field cube
 * registered with the scalar-volume renderer.
 *
 * Each volume lives as a registry entry so its presentation defaults
 * (palette, contrast, exposure, …) sit next to its `binBaseName`. Boot
 * visibility lives in the owning Layer's `initialState`, not here. Covers
 * every production cube (MCPM, Polyphorm 2MRS, …).
 */
export type CosmicWebDensitySourceEntry = SourceEntryBase &
  VolumeFieldDefaults & {
    readonly type: 'cosmicWebDensity';
    /** Stem of the cube's files: the pyramid sidecar `<stem>.json`, or the `<stem>.scfd`. */
    readonly binBaseName: string;
    /**
     * 'pyramid': `volume-pyramid/v1/` sidecar + level files, base level by tier.
     * 'scfd': one SCFD v3 cube at every tier.
     */
    readonly storage: 'pyramid' | 'scfd';
    /** Asset-queue rank of this row's cube (`AssetWiringRow.priority`). */
    readonly priority: number;
  };
