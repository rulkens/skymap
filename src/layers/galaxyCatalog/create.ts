/**
 * create — the galaxy family's whole construction, in dependency order:
 * renderers, then subsystems, then slots. Everything is a local here and a field
 * on the returned runtime; nothing lands on `EngineState`, and no consumer
 * re-checks a null handle.
 */

import type { GalaxyCatalog } from '../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogSourceType } from './@types/GalaxyCatalogSourceType';
import type { GalaxyRecordSource } from './records/@types/GalaxyRecordSource';
import type { SourceType } from '../../@types/data/SourceType';
import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { FamousGalaxyMetaEntry } from '../../@types/loading/FamousGalaxyMetaEntry';
import type { GalaxyCatalogReq } from '../../@types/loading/GalaxyCatalogReq';
import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { GalaxyCatalogFacts } from './@types/GalaxyCatalogFacts';
import type { GalaxyCatalogRuntime } from './@types/GalaxyCatalogRuntime';

import { GALAXY_CATALOG_SOURCE_RECORD } from './sources/galaxyCatalogSourceRecord';
import { GALAXY_CATALOG_SOURCES } from './sources/galaxyCatalogSources';
import { GALAXY_CATALOG_SOURCE_ROWS } from './sources/galaxyCatalogSourceRows';
import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { SLAB_REVERSED_Z, COSMO } from '../../services/engine/frame/slabs';

import { createGalaxyPointRenderer } from './pointSprites/render/galaxyPointRenderer';
import { createGalaxyPickRenderer } from './pointSprites/render/galaxyPickRenderer';
import { createTexturedDiskRenderer } from './disks/textured/render/texturedDiskRenderer';
import { createProceduralDiskRenderer } from './disks/procedural/render/proceduralDiskRenderer';
import { wireImpostorSubsystems } from './disks/load/wireImpostorSubsystems';
import { wireGalaxyCatalogSourceSlot } from './records/load/wireGalaxyCatalogSourceSlot';
import { createFamousGalaxiesMetaSlot } from './famousGalaxies/load/famousGalaxiesMetaSlot';
import { createPgcAliasSlot } from './aliases/load/pgcAliasSlot';
import { wireHiResFamousSlot } from './disks/load/wireHiResFamousSlot';
import { galaxyRecordBridge } from './selection/present/galaxyRecordBridge';
import { catalogPickCodes } from '../../utils/picking/catalogPickCodes';

export function create(deps: LayerCoreDeps<GalaxyCatalogFacts>): GalaxyCatalogRuntime {
  const device = deps.ctx.device;
  const catalogs = new Map<SourceType, GalaxyCatalog>();
  const records = new Map<GalaxyCatalogSourceType, GalaxyRecordSource>();
  // Private cell behind the runtime's getter: the meta slot is its only writer,
  // so nothing has to hand the runtime object to a closure built before it.
  let famousMeta: readonly FamousGalaxyMetaEntry[] = [];
  // Same pattern: bumped by every point-slot commit (wireGalaxyCatalogSourceSlot),
  // read by `frame`'s reconciles through the getter below.
  let catalogsVersion = 0;
  const pickCodes = catalogPickCodes(GALAXY_CATALOG_SOURCE_ROWS, deps.pickCode);

  const pointRenderer = createGalaxyPointRenderer({
    device,
    pickCodeOf: pickCodes.pickCodeOf,
    targetFormat: HDR_TARGET_FORMAT,
    fadeBgl: deps.fadeBgl,
    sourceBgl: deps.sourceBgl,
    focusBgl: deps.focusBgl,
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
    pickCodeOf: pickCodes.pickCodeOf,
  });

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

  const points = new Map<GalaxyCatalogSourceType, AssetSlot<GalaxyCatalog, GalaxyCatalogReq>>(
    GALAXY_CATALOG_SOURCES.map((code) => [
      code,
      wireGalaxyCatalogSourceSlot(GALAXY_CATALOG_SOURCE_RECORD[code], deps, {
        pointRenderer,
        catalogs,
        records,
        famousMeta: () => famousMeta,
        bumpCatalogsVersion: () => {
          catalogsVersion += 1;
        },
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
    records,
    recordBridge: galaxyRecordBridge(records),
    pickCodes,
    get famousMeta() {
      return famousMeta;
    },
    get catalogsVersion() {
      return catalogsVersion;
    },
    publish: deps.publish,
    focusBindGroup: deps.focusUniform.bindGroup,
    points,
    famousGalaxiesMeta,
    pgcAlias,
    hiResFamous,
    pointRenderer,
    pickRenderer,
    texturedDiskRenderer,
    proceduralDiskRenderer,
    galaxyAtlas,
    texturedDisks,
    proceduralDisks,
    diskPlannerWalk,
  };
}
