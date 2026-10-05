/**
 * What the Layer publishes into `state.engine.galaxyCatalog` (Rulings 1, 3, 6,
 * 12) — the command palette's famous sidecar and alias index, the debug
 * panel's per-source provenance tally, and the InfoCard's structure member count.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { ProvenanceCounts } from '../../../@types/engine/ProvenanceCounts';
import type { FamousGalaxyMetaEntry } from '../../../@types/loading/FamousGalaxyMetaEntry';
import type { AliasIndexEntry } from '../../../@types/engine/AliasIndexEntry';

export type GalaxyCatalogFacts = {
  readonly famousMeta: readonly FamousGalaxyMetaEntry[];
  readonly provenanceCounts: Partial<Record<SourceType, ProvenanceCounts>>;
  readonly aliasIndex: readonly AliasIndexEntry[];
  /** null = not countable yet: no visible catalog loaded, or nothing structural selected. */
  readonly structureMemberCount: number | null;
};
