import type { SourceType } from '../../../src/@types/data/SourceType';
import type { Tier } from '../../../src/@types/data/Tier';
import type { CatalogPoints } from './CatalogPoints';

/**
 * CatalogSlice — which v9 catalogs feed the sim, and what the last load
 * produced. `weightMode` mirrors `deriveAgentWeights`'s own union so a
 * slice value can be passed straight through with no re-mapping.
 * `pointCount`/`nanFillCount` are the load's own report — the HUD's NaN
 * fraction is `nanFillCount / pointCount`, computed at the display site
 * rather than stored (it's derived, not state).
 *
 * `packedOverride` carries a dev-drop's parsed Polyphorm-fork catalog
 * (spec §9) — set once App.tsx installs a drop, cleared never (a session
 * that drops in stays on the packed catalog). `packedSourceName` is its
 * filename, for the HUD/status line. `packedDropId` is a monotonic counter
 * `setPackedCatalog` bumps on every install — the fork names its export
 * file identically across runs, so a filename alone can't tell two
 * different drops apart; a rebuild-trigger key needs this instead.
 */
export type CatalogSlice = {
  readonly sources: readonly SourceType[];
  readonly tier: Tier;
  readonly loadStatus: 'idle' | 'loading' | 'loaded' | 'error';
  readonly pointCount: number;
  readonly nanFillCount: number;
  readonly weightMode: 'stellarMass' | 'uniform';
  readonly packedOverride: CatalogPoints | null;
  readonly packedSourceName: string | null;
  readonly packedDropId: number;
  /**
   * Human-readable status for a state Viewport can reach but isn't an error —
   * currently just the zero-point case (every selected source excluded at
   * this tier, or none selected). `setCatalogLoaded` clears it on every
   * completed load so a stale message can't survive a real one.
   */
  readonly statusMessage: string | null;
};
