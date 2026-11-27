import type { Tier } from '../../../shared/src/@types/data/Tier';
import type { AgentWeights } from '../catalog/AgentWeights';
import type { CatalogPoints } from '../catalog/CatalogPoints';
import type { UserFileProvenance } from '../catalog/UserFileProvenance';

/**
 * BuildInputs — the store values the running harness was built from. An export
 * reads these, not the store, which holds the next request for as long as a
 * catalog fetch or the rebuild debounce takes.
 */
export type BuildInputs = {
  readonly points: CatalogPoints;
  readonly weights: AgentWeights;
  readonly userFile: UserFileProvenance | null;
  readonly tier: Tier;
  readonly agentCount: number;
};
