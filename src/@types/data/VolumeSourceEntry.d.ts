import type { SourceEntryBase } from './SourceEntryBase';
import type { VolumeFieldDefaults } from './VolumeFieldDefaults';

/**
 * Volume-typed row of the SOURCE_REGISTRY — scalar-field cube
 * registered with the scalar-volume renderer.
 *
 * Each volume lives as a registry entry so its presentation defaults
 * (palette, contrast, exposure, …) sit next to its `binBaseName` and
 * visibility default. Covers both production cubes (CF-4, MCPM —
 * loaded from `.scfd` files) and DEV-only synthetic fixtures
 * (`debug-gaussian`, `debug-cartesian`, `debug-spherical` — generated
 * procedurally at runtime). The procedural ones set `binBaseName: null`
 * and are conditionally minted under `import.meta.env.DEV`.
 */
export type VolumeSourceEntry = SourceEntryBase &
  VolumeFieldDefaults & {
    readonly type: 'volume';
    /** Stable numeric tag; not persisted, only used as the registry key. */
    readonly code: number;
    /**
     * Renderer-side identifier — the key `scalarVolumeRenderer.upload`
     * uses to look up the field at the GPU layer. Kebab-case for UI
     * legibility; distinct from `binBaseName` because the on-disk name
     * sometimes uses underscores (`cf4_density.scfd`).
     */
    readonly handle: string;
    /**
     * Filename stem under `public/data/` (the loader appends `.scfd`,
     * with the tier suffix wired in by tier-aware fetchers). `null` for
     * procedurally-generated cubes that don't have an on-disk source.
     */
    readonly binBaseName: string | null;
    /**
     * Whether this volume ships per-tier `.scfd` variants
     * (`<binBaseName>-<tier>.scfd`). False for tier-agnostic cubes whose
     * single file is reused across every tier (CF-4 is full-volume; MCPM
     * is per-tier; procedural fixtures are always false).
     */
    readonly tiered: boolean;
  };
