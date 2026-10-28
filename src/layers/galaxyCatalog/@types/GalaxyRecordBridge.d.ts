import type { GalaxyCatalogSourceType } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { GalaxyRow } from '../../../@types/engine/GalaxyRow';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';

type GalaxyCatalogRef = Extract<SelectionRef, { type: 'galaxyCatalog' }>;

/**
 * The record sources' lookups made synchronous for the selection row: a plain
 * value passes through, a pending one answers null until it settles, and the
 * settle is announced so the source-count pulse can wake a deferring saga.
 */
export type GalaxyRecordBridge = {
  row(source: GalaxyCatalogSourceType, ordinal: number): GalaxyRow | null;
  /** `pgc-…` / `sdss-…`: the claiming sources, lowest claim rank first. */
  resolveDurableId(id: string): GalaxyCatalogRef | null;
  /** The angularly nearest answer across every loaded source. */
  resolvePosition(raDeg: number, decDeg: number, distMpc: number | null): GalaxyCatalogRef | null;
  /** Fires with the source whose pending lookup settled while it is still loaded. */
  onSettle(listener: (source: GalaxyCatalogSourceType) => void): () => void;
};
