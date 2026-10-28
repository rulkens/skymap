import type { GalaxyCatalogSourceType } from './GalaxyCatalogSourceType';
import type { GalaxyColumnBlock } from './GalaxyColumnBlock';
import type { GalaxyRow } from '../../engine/GalaxyRow';
import type { ProvenanceCounts } from '../../engine/ProvenanceCounts';

/**
 * How galaxy consumers read one loaded source's records, whatever its storage.
 * Lives in core `@types` because the disk walk's input (a core type) carries it.
 * A record's ordinal is stable for the source's lifetime; a pick index is not
 * (it is where the record sits in the drawn buffer), hence the two mappings.
 */
export type GalaxyRecordSource = {
  readonly source: GalaxyCatalogSourceType;
  /** Real records the source holds in total (UI count); resident or not. */
  readonly recordCount: number;
  readonly stats: {
    readonly medianAbsMag: number;
    readonly magOffset: number;
    readonly provenance: ProvenanceCounts;
  };
  /** Pick instance → ordinal and back; null when the record's object is not resident. */
  ordinalOfPick(pickIndex: number): number | null;
  pickOfOrdinal(ordinal: number): number | null;
  /** Resident records as column blocks; record ordinal = ordinalBase + row index in the block. */
  forEachResidentBlock(visit: (block: GalaxyColumnBlock, ordinalBase: number) => void): void;
  /** Synchronous membership for the palette's name join: does this source hold `pgc-…` / `sdss-…`? */
  hasDurableId(id: string): boolean;
  /** Lookups that may need data first: a plain value when it is at hand, a promise when it is not. */
  loadRow(ordinal: number): GalaxyRow | null | Promise<GalaxyRow | null>;
  /** `pgc-…`, `sdss-…` → ordinal. */
  resolveDurableId(id: string): number | null | Promise<number | null>;
  /** `distMpc` is null for a legacy two-part `pos@` id, answered by direction within 30″. */
  resolvePosition(
    raDeg: number,
    decDeg: number,
    distMpc: number | null,
  ): number | null | Promise<number | null>;
};
