/**
 * The structure Layer's whole runtime: the record store, one marker renderer
 * per slab, and the bulk-catalog slot that feeds the store. Non-null
 * throughout — `create` builds all four before returning, which is what lets
 * the passes read them without a null check.
 */

import type { StructureStore } from '../catalog/@types/StructureStore';
import type { StructureMarkerRenderer } from '../markers/@types/StructureMarkerRenderer';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { StructureCatalogPayload } from '../catalog/@types/StructureCatalogPayload';
import type { StructureCatalogReq } from '../catalog/@types/StructureCatalogReq';

export type StructureRuntime = {
  readonly store: StructureStore;
  readonly cosmoRenderer: StructureMarkerRenderer;
  readonly nearRenderer: StructureMarkerRenderer;
  readonly slot: AssetSlot<StructureCatalogPayload, StructureCatalogReq>;
};
