/**
 * What the Layer publishes into `state.engine.galaxyCatalog` (Rulings 1, 6,
 * 12) — the command palette's famous sidecar and alias index, and the debug
 * panel's per-source provenance tally.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { ProvenanceCounts } from '../../../@types/engine/ProvenanceCounts';
import type { FamousGalaxyMetaEntry } from '../../../@types/loading/FamousGalaxyMetaEntry';
import type { AliasIndexEntry } from '../../../@types/engine/AliasIndexEntry';

export type GalaxyCatalogFacts = {
  readonly famousMeta: readonly FamousGalaxyMetaEntry[];
  readonly provenanceCounts: Partial<Record<SourceType, ProvenanceCounts>>;
  readonly aliasIndex: readonly AliasIndexEntry[];
};
