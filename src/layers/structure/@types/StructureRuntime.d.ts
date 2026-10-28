/**
 * The structure Layer's whole runtime: the record store, its renderers, and
 * the bulk-catalog slot that feeds the store. Non-null throughout — `create`
 * builds them all before returning, so the passes read them without a null check.
 */

import type { StructureStore } from './StructureStore';
import type { StructureMarkerRenderer } from './StructureMarkerRenderer';
import type { ExoplanetOrbitPlaneRenderer } from './ExoplanetOrbitPlaneRenderer';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { StructureCatalogPayload } from '../../../@types/loading/structureCatalogPayload/StructureCatalogPayload';
import type { StructureCatalogReq } from './StructureCatalogReq';

export type StructureRuntime = {
  readonly store: StructureStore;
  readonly cosmoRenderer: StructureMarkerRenderer;
  readonly nearRenderer: StructureMarkerRenderer;
  /** Draws the exoplanet orbit diagrams' dots (`exoplanetOrbitsPass`); never picked. */
  readonly orbitRenderer: StructureMarkerRenderer;
  /** Draws the exoplanet orbit diagrams' orbits and habitable zone. */
  readonly orbitPlaneRenderer: ExoplanetOrbitPlaneRenderer;
  readonly slot: AssetSlot<StructureCatalogPayload, StructureCatalogReq>;
};
