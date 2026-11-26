import type { GalaxyCatalogId } from '../../@types/GalaxyCatalogId';
import type { GalaxyRow } from '../../records/@types/GalaxyRow';
import type { GalaxyCatalogRef } from './GalaxyCatalogRef';
import type { FocusResolution } from '../../../../@types/engine/selection/FocusResolution';

/** The record sources' lookups made synchronous; see `galaxyRecordBridge` for the rules. */
export type GalaxyRecordBridge = {
  row(source: GalaxyCatalogId, ordinal: number): GalaxyRow | null;
  resolveDurableId(id: string): FocusResolution<GalaxyCatalogRef>;
  resolvePosition(
    raDeg: number,
    decDeg: number,
    distMpc: number | null,
  ): FocusResolution<GalaxyCatalogRef>;
  /** Fires with the source whose pending lookup settled while it is still loaded. */
  onSettle(listener: (source: GalaxyCatalogId) => void): () => void;
};
