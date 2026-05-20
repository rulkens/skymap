import type { SourceEntryBase } from './SourceEntryBase';
import type { VolumeFieldDefaults } from './VolumeFieldDefaults';

/**
 * Volume-typed row of the SOURCE_REGISTRY — scalar-field cube
 * (`.scfd` v2 binary) registered with the scalar-volume renderer.
 *
 * Each production cube (CF-4 DM density, MCPM cosmic web) lives as a
 * registry entry so its presentation defaults (palette, contrast,
 * exposure, …) sit next to its `binBaseName` and the visibility default.
 * The renderer's runtime `addField(handle, cube)` API still uses a
 * string handle — `handle` is the registry-side mirror of that name.
 *
 * Debug / dev-only synthetic cubes (`debug-gaussian` etc.) stay in
 * `data/volumeFieldDefaults.ts`; they have no numeric source code, no
 * persisted identity, and are conditionally minted in development builds.
 */
export type VolumeSourceEntry = SourceEntryBase &
  VolumeFieldDefaults & {
    readonly type: 'volume';
    /** Stable numeric tag; not persisted, only used as the registry key. */
    readonly code: number;
    /**
     * Renderer-side string handle (`'cf4-density'`, `'mcpm'`) — the key
     * `scalarVolumeRenderer.addField` uses to look up the field at the
     * GPU layer. Distinct from `binBaseName` because the on-disk name
     * sometimes uses underscores (`cf4_density.scfd`) while the handle
     * uses kebab-case for UI legibility.
     */
    readonly handle: string;
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
