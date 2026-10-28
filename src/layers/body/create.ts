/**
 * create — the body renderers, then the texture slots whose commits write them. Every
 * sphere-body renderer draws into the `foreground:0` render-target row, so its
 * pipeline formats share HDR_TARGET_FORMAT/FOREGROUND_DEPTH_FORMAT with that row's
 * format/depth in renderTargets.ts, and the two can't drift apart.
 */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { BodyRuntime } from './@types/BodyRuntime';
import { HDR_TARGET_FORMAT, FOREGROUND_DEPTH_FORMAT } from '../../data/renderTargetFormats';
import { SURFACE_TILE_MESH_RESOLUTION } from '../../data/bodies/surfaceTileParams';
import { SLAB_REVERSED_Z, NEAR0 } from '../../services/engine/frame/slabs';
import { createBodyGlintRenderer } from '../../services/gpu/renderers/bodies/bodyGlintRenderer';
import { createEarthRenderer } from './render/earthRenderer';
import { createSurfaceTileRenderer } from './render/surfaceTileRenderer';
import { createTerrainPickMarkerRenderer } from './render/terrainPickMarkerRenderer';
import { createTexturedBodyRenderer } from './render/texturedBodyRenderer';
import { createPlanetRenderer } from './render/planetRenderer';
import { createRingRenderer } from './render/ringRenderer';
import { createCloudShellRenderer } from './render/cloudShellRenderer';
import { createAtmosphereShellRenderer } from './render/atmosphereShellRenderer';
import { ATMOSPHERE_PARAMS } from './present/atmosphereParams';
import { createBodyTextureSlots } from './load/bodyTextureSlots';
import { createBodyTextureAtlasSlot } from './load/bodyTextureAtlasSlot';

export function create(deps: LayerCoreDeps): BodyRuntime {
  const { device } = deps.ctx;
  const reversedZ = SLAB_REVERSED_Z[NEAR0]!;
  const renderers = {
    earth: createEarthRenderer(device, HDR_TARGET_FORMAT, FOREGROUND_DEPTH_FORMAT, reversedZ),
    surfaceTile: createSurfaceTileRenderer(
      device,
      HDR_TARGET_FORMAT,
      FOREGROUND_DEPTH_FORMAT,
      reversedZ,
      SURFACE_TILE_MESH_RESOLUTION,
    ),
    terrainPickMarker: createTerrainPickMarkerRenderer(
      device,
      HDR_TARGET_FORMAT,
      FOREGROUND_DEPTH_FORMAT,
      reversedZ,
    ),
    texturedBody: createTexturedBodyRenderer(
      device,
      HDR_TARGET_FORMAT,
      FOREGROUND_DEPTH_FORMAT,
      reversedZ,
    ),
    planet: createPlanetRenderer(device, HDR_TARGET_FORMAT, FOREGROUND_DEPTH_FORMAT, reversedZ),
    ring: createRingRenderer(device, HDR_TARGET_FORMAT, FOREGROUND_DEPTH_FORMAT, reversedZ),
    cloudShell: createCloudShellRenderer(
      device,
      HDR_TARGET_FORMAT,
      FOREGROUND_DEPTH_FORMAT,
      reversedZ,
    ),
    atmosphere: createAtmosphereShellRenderer(device, HDR_TARGET_FORMAT, ATMOSPHERE_PARAMS),
    glint: createBodyGlintRenderer(device, HDR_TARGET_FORMAT),
  };
  return {
    ...renderers,
    textureSlots: createBodyTextureSlots(renderers),
    atlasSlot: createBodyTextureAtlasSlot(renderers),
  };
}
