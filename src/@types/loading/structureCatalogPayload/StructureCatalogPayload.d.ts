import type { StructureCatalog } from '../../data/structure/structureCatalog/StructureCatalog';
import type { StructureMetaEntry } from './StructureMetaEntry';

/**
 * The decoded structure-catalog asset: the numeric `.ccat` catalog paired with
 * its string sidecar.  The two are built in lock-step and index-parallel —
 * `catalog.count === meta.length` is an invariant the fetcher enforces — so a
 * later merge step can attach names + descriptions to each record by localIdx.
 */
export type StructureCatalogPayload = {
  catalog: StructureCatalog;
  meta: readonly StructureMetaEntry[];
};
