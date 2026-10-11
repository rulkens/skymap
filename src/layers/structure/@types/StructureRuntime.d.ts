/**
 * The structure Layer's whole runtime: the record store, one marker renderer
 * per slab, and the bulk-catalog slot that feeds the store. Non-null
 * throughout — `create` builds all four before returning, which is what lets
 * the passes read them without a null check.
 */

import type { StructureStore } from './StructureStore';
import type { StructureMarkerRenderer } from './StructureMarkerRenderer';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { StructureCatalogPayload } from '../../../@types/loading/structureCatalogPayload/StructureCatalogPayload';
import type { StructureCatalogReq } from './StructureCatalogReq';

export type StructureRuntime = {
  readonly store: StructureStore;
  readonly cosmoRenderer: StructureMarkerRenderer;
  readonly nearRenderer: StructureMarkerRenderer;
  readonly slot: AssetSlot<StructureCatalogPayload, StructureCatalogReq>;
};
