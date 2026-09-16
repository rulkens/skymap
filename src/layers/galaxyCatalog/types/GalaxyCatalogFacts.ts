/**
 * What the Layer publishes into `state.engine.galaxyCatalog` (Rulings 6, 12) —
 * the two reads whose publisher moved into the Layer and so could not stay a
 * core reducer: the command palette's famous sidecar and the debug panel's
 * per-source provenance tally.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { ProvenanceCounts } from '../../../@types/engine/ProvenanceCounts';
import type { FamousGalaxyMetaEntry } from '../../../@types/loading/FamousGalaxyMetaEntry';

export type GalaxyCatalogFacts = {
  readonly famousMeta: readonly FamousGalaxyMetaEntry[];
  readonly provenanceCounts: Partial<Record<SourceType, ProvenanceCounts>>;
};
