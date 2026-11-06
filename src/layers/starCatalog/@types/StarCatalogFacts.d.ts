/**
 * What the Layer publishes into `state.engine.starCatalog` — the famous-star
 * InfoCard sidecar (mirroring `GalaxyCatalogFacts.famousMeta`) and the Debug
 * panel's chunk-pool resize outcome.
 */

import type { FamousStarMetaEntry } from '../../../@types/loading/FamousStarMetaEntry';

export type StarCatalogFacts = {
  readonly famousStarsMeta: readonly FamousStarMetaEntry[];
  /** Why the last chunk-pool resize failed (names the largest count that fits); null once one succeeds. */
  readonly chunkSlotsError: string | null;
};
