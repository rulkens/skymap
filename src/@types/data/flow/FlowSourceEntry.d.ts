import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * Flow-typed row of the SOURCE_REGISTRY — the CF4++ peculiar-velocity field
 * overlay. A single global asset (`flowfield.scfd`), demand-loaded on first
 * enable like the volume cubes; no per-record identity or pick code.
 *
 * The row describes the asset, not the look: the overlay's default look/motion
 * lives in `DEFAULT_FLOW`, beside the slice it seeds.
 */
export type FlowSourceEntry = SourceEntryBase & {
  readonly type: 'flow';
  /** Stable numeric tag; not persisted, only used as the registry key. */
  readonly code: number;
  /** Filename stem under `public/data/` (the loader appends `.scfd`). */
  readonly binBaseName: string;
};
