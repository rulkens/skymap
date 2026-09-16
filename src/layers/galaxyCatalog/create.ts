/**
 * create — the galaxy family's whole construction, in dependency order:
 * renderers, then subsystems, then slots. Everything is a local here and a field
 * on the returned runtime; nothing lands on `EngineState`, and no consumer
 * re-checks a null handle.
 */

import type { GalaxyCatalog } from '../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { SourceType } from '../../@types/data/SourceType';
import type { ProvenanceCounts } from '../../@types/engine/ProvenanceCounts';
import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { FamousGalaxyMetaEntry } from '../../@types/loading/FamousGalaxyMetaEntry';
import type { GalaxyCatalogReq } from '../../@types/loading/GalaxyCatalogReq';
import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { GalaxyCatalogFacts } from './types/GalaxyCatalogFacts';
import type { GalaxyCatalogRuntime } from './types/GalaxyCatalogRuntime';

import { GALAXY_CATALOG_SOURCES, SOURCE_REGISTRY } from '../../data/sources';
import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { SLAB_REVERSED_Z, COSMO } from '../../services/engine/frame/slabs';

import { createGalaxyPointRenderer } from './render/galaxyPointRenderer';
import { createGalaxyPickRenderer } from './render/galaxyPickRenderer';
import { createTexturedDiskRenderer } from './render/texturedDiskRenderer';
import { createProceduralDiskRenderer } from './render/proceduralDiskRenderer';
import { createDiskRadiusRing } from './render/diskRadiusRing';
import { createBiasCorrectionSubsystem } from './subsystems/biasCorrectionSubsystem';
import { wireImpostorSubsystems } from './load/wireImpostorSubsystems';
import { wireGalaxyCatalogSourceSlot } from './load/wireGalaxyCatalogSourceSlot';
import { createFamousGalaxiesMetaSlot } from './load/famousGalaxiesMetaSlot';
import { createPgcAliasSlot } from './load/pgcAliasSlot';
import { wireHiResFamousSlot } from './load/wireHiResFamousSlot';

export function create(deps: LayerCoreDeps<GalaxyCatalogFacts>): GalaxyCatalogRuntime {
  const device = deps.ctx.device;
  const catalogs = new Map<SourceType, GalaxyCatalog>();
  const provenanceCounts = new Map<SourceType, ProvenanceCounts>();
  // Private cell behind the runtime's getter: the meta slot is its only writer,
  // so nothing has to hand the runtime object to a closure built before it.
  let famousMeta: readonly FamousGalaxyMetaEntry[] = [];

  const pointRenderer = createGalaxyPointRenderer({
    device,
    targetFormat: HDR_TARGET_FORMAT,
    fadeBgl: deps.fadeBgl,
    sourceBgl: deps.sourceBgl,
    focusBgl: deps.focusBgl,
  });

  const biasCorrection = createBiasCorrectionSubsystem({
    renderer: pointRenderer,
    getMode: () => deps.store.getState().settings.bias.mode,
    getLoadedClouds: () => catalogs,
    requestRender: deps.requestRender,
  });

  const texturedDiskRenderer = createTexturedDiskRenderer(
    { device, context: deps.ctx.context, targetFormat: HDR_TARGET_FORMAT, canvas: deps.ctx.canvas },
    deps.focusBgl,
  );
  const proceduralDiskRenderer = createProceduralDiskRenderer({
    device,
    context: deps.ctx.context,
    targetFormat: HDR_TARGET_FORMAT,
    canvas: deps.ctx.canvas,
    focusBgl: deps.focusBgl,
    reversedZ: SLAB_REVERSED_Z[COSMO]!,
  });
  const diskRadiusRing = createDiskRadiusRing(device);

  // Captures `focusUniform.bindGroup` at construction, which is why core
  // destroys the focus uniform after every Layer (D8).
  const pickRenderer = createGalaxyPickRenderer(
    device,
    deps.fadeBgl,
    deps.sourceBgl,
    deps.focusBgl,
    deps.focusUniform.bindGroup,
    SLAB_REVERSED_Z[COSMO]!,
  );

  const { galaxyAtlas, texturedDisks, proceduralDisks, diskPlannerWalk } = wireImpostorSubsystems({
    device,
    requestRender: deps.requestRender,
    texturedDiskRenderer,
  });

  const points = new Map<SourceType, AssetSlot<GalaxyCatalog, GalaxyCatalogReq>>(
    GALAXY_CATALOG_SOURCES.map((code) => [
      code,
      wireGalaxyCatalogSourceSlot(SOURCE_REGISTRY[code], deps, {
        pointRenderer,
        catalogs,
        provenanceCounts,
      }),
    ]),
  );

  const famousGalaxiesMeta = createFamousGalaxiesMetaSlot(deps, (meta) => {
    famousMeta = meta;
  });
  const pgcAlias = createPgcAliasSlot();
  const hiResFamous = wireHiResFamousSlot({
    device,
    requestRender: deps.requestRender,
    texturedDiskRenderer,
    texturedDisks,
  });

  return {
    catalogs,
    get famousMeta() {
      return famousMeta;
    },
    provenanceCounts,
    points,
    famousGalaxiesMeta,
    pgcAlias,
    hiResFamous,
    pointRenderer,
    pickRenderer,
    texturedDiskRenderer,
    proceduralDiskRenderer,
    diskRadiusRing,
    galaxyAtlas,
    texturedDisks,
    proceduralDisks,
    diskPlannerWalk,
    biasCorrection,
    // Seeded from the live setting, not a default: the bake fires only on a
    // CHANGE, and nothing bakes at boot today either (the per-source upload
    // callback covers the boot path).
    biasLastApplied: deps.store.getState().settings.bias.mode,
  };
}
