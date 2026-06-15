import type { SOURCE_REGISTRY } from '../../../data/sources';

type AnyEntry = (typeof SOURCE_REGISTRY)[keyof typeof SOURCE_REGISTRY];

/**
 * VolumeFieldId — the closed set of scalar-volume identifiers the renderer
 * accepts. Derived from the `type: 'volume'` registry rows, so adding a volume
 * entry widens the union automatically. Covers production cubes
 * (`'cf4-density'`, `'mcpm'`) and DEV-only synthetic fixtures (`'debug-*'`)
 * uniformly — the registry is the single source of truth for "what volumes
 * exist". Type-only (volume ids aren't iterated at runtime), so unlike
 * `GalaxyCatalogId` / `StructureCategory` it has no runtime-array companion.
 */
export type VolumeFieldId = Extract<AnyEntry, { readonly type: 'volume' }>['id'];
