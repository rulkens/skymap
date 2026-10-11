/**
 * create — the store, one marker renderer per slab, then the bulk slot and the
 * projection that fills the store from it. The renderers come first so a
 * throwing constructor leaves nothing published. The anchors land
 * synchronously in the projection, so the selection row resolves a featured
 * structure from boot.
 */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { StructureFacts } from './@types/StructureFacts';
import type { StructureRuntime } from './@types/StructureRuntime';

import { COSMO, NEAR0 } from '../../services/engine/frame/slabs';
import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { STRUCTURE_IDS_BY_SCALE } from '../../data/structure/structureIdsByScale';
import { createStructureStore } from './load/createStructureStore';
import { createStructureMarkerRenderer } from './render/structureMarkerRenderer';
import { createStructureCatalogSlot } from './load/structureCatalogSlot';
import { wireStructureProjection } from './load/wireStructureProjection';

export function create(deps: LayerCoreDeps<StructureFacts>): StructureRuntime {
  const store = createStructureStore();
  const cosmoRenderer = createStructureMarkerRenderer(
    deps.ctx,
    HDR_TARGET_FORMAT,
    deps.fadeBgl,
    COSMO,
    STRUCTURE_IDS_BY_SCALE.cosmic,
  );
  // Its own uniform + instance buffers: both marker passes record into one
  // encoder, so a shared uniform would hand both draws the last-written matrix.
  const nearRenderer = createStructureMarkerRenderer(
    deps.ctx,
    HDR_TARGET_FORMAT,
    deps.fadeBgl,
    NEAR0,
    STRUCTURE_IDS_BY_SCALE.milkyWay,
  );
  const slot = createStructureCatalogSlot();
  wireStructureProjection({ store, slot }, deps.publish, deps.store.dispatch);
  return { store, cosmoRenderer, nearRenderer, slot };
}
