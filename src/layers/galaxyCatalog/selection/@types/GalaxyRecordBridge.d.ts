import type { GalaxyCatalogId } from '../../@types/GalaxyCatalogId';
import type { GalaxyRow } from '../../records/@types/GalaxyRow';
import type { GalaxyCatalogRef } from './GalaxyCatalogRef';
import type { FocusResolution } from '../../../../@types/engine/selection/FocusResolution';

/**
 * The record sources' lookups made synchronous for the selection row: a plain
 * value passes through, a pending one answers null (an id: `pending`) until it
 * settles, and the settle is announced so the source-count pulse can wake a
 * deferring saga. An id miss is `absent` only once every source that could hold
 * it is resident.
 */
export type GalaxyRecordBridge = {
  row(source: GalaxyCatalogId, ordinal: number): GalaxyRow | null;
  /** `pgc-…` / `sdss-…`: the claiming sources, lowest claim rank first. */
  resolveDurableId(id: string): FocusResolution<GalaxyCatalogRef>;
  /** The angularly nearest answer across every loaded source. */
  resolvePosition(
    raDeg: number,
    decDeg: number,
    distMpc: number | null,
  ): FocusResolution<GalaxyCatalogRef>;
  /** Fires with the source whose pending lookup settled while it is still loaded. */
  onSettle(listener: (source: GalaxyCatalogId) => void): () => void;
};
