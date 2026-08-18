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
 * filename, for the HUD/status line.
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
};
