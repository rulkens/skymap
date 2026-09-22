import type { SourceEntryBase } from '../SourceEntryBase';
import type { VolumeFieldDefaults } from './VolumeFieldDefaults';

/**
 * Volume-typed row of the SOURCE_REGISTRY — scalar-field cube
 * registered with the scalar-volume renderer.
 *
 * Each volume lives as a registry entry so its presentation defaults
 * (palette, contrast, exposure, …) sit next to its `binBaseName` and
 * visibility default. Covers every production cube (CF-4, MCPM, …),
 * each loaded from its own `.scfd` file.
 */
export type VolumeSourceEntry = SourceEntryBase &
  VolumeFieldDefaults & {
    readonly type: 'volume';
    /** Stable numeric tag; not persisted, only used as the registry key. */
    readonly code: number;
    /**
     * Filename stem under `public/data/` (the loader appends `.scfd`,
     * with the tier suffix wired in by tier-aware fetchers).
     */
    readonly binBaseName: string;
    /**
     * Whether this volume ships per-tier `.scfd` variants
     * (`<binBaseName>-<tier>.scfd`). False for tier-agnostic cubes whose
     * single file is reused across every tier (CF-4 is full-volume; MCPM
     * is per-tier).
     */
    readonly tiered: boolean;
  };
