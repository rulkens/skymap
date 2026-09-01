import type { SourceType } from '../../../src/@types/data/SourceType';
import type { Tier } from '../../../src/@types/data/Tier';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { CatalogPoints } from './CatalogPoints';

/**
 * CatalogSlice — which v9 catalogs feed the sim, and what the last load
 * produced. `weightMode` mirrors `deriveAgentWeights`'s own union for a
 * no-remap pass-through. `nanFillCount / pointCount` is the NaN fraction,
 * computed at the display site rather than stored. `packedOverride` is a
 * dev-drop's parsed fork catalog — sticky for the session, cleared never;
 * `packedDropId` bumps on every install since the fork's export filename
 * repeats across runs, so a re-drop is never mistaken for a repeat of the
 * same install. `catalogBoundsMpc` is cached (not recomputed from positions) so
 * `deriveGridBox` derives the SAME box for Viewport's build and the grid
 * panel's live readout.
 */
export type CatalogSlice = {
  readonly sources: readonly SourceType[];
  readonly tier: Tier;
  readonly loadStatus: 'idle' | 'loading' | 'loaded' | 'error';
  /** The last completed load's points — `watchCatalogSaga`'s own, not Viewport's
   * closure. Null until the first `catalogLoaded`; Viewport's build path
   * re-derives weights from it on every rebuild (weightMode can change without
   * a reload), so only `points` itself needs to live here, not weights too. */
  readonly points: CatalogPoints | null;
  readonly pointCount: number;
  readonly nanFillCount: number;
  readonly weightMode: 'stellarMass' | 'uniform';
  readonly packedOverride: CatalogPoints | null;
  readonly packedSourceName: string | null;
  readonly packedDropId: number;
  readonly catalogBoundsMpc: { readonly min: Vec3; readonly max: Vec3 } | null;
  /**
   * Human-readable status for a state Viewport can reach but isn't an error —
   * currently just the zero-point case (every selected source excluded at
   * this tier, or none selected). `catalogLoaded` clears it on every
   * completed load so a stale message can't survive a real one.
   */
  readonly statusMessage: string | null;
};
