import type { SourceEntryBase } from '../SourceEntryBase';
import type { FlowFieldDefaults } from './FlowFieldDefaults';

/**
 * Flow-typed row of the SOURCE_REGISTRY — the CF4++ peculiar-velocity field
 * overlay. A single global asset (`flowfield.scfd`), demand-loaded on first
 * enable like the volume cubes; no per-record identity or pick code.
 *
 * Carries `FlowFieldDefaults` so the registry is the single source of the
 * overlay's default look/motion — `settings.flow` (and the `DEFAULT_FLOW` seed)
 * derive from this row.
 */
export type FlowSourceEntry = SourceEntryBase &
  FlowFieldDefaults & {
    readonly type: 'flow';
    /** Stable numeric tag; not persisted, only used as the registry key. */
    readonly code: number;
    /** Filename stem under `public/data/` (the loader appends `.scfd`). */
    readonly binBaseName: string;
  };
