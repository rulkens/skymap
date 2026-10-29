/**
 * create — the body renderers, then the texture slots whose commits write them, then the
 * surface-tile stream. Every sphere-body renderer draws into the `foreground:0`
 * render-target row, so its pipeline formats share HDR_TARGET_FORMAT/FOREGROUND_DEPTH_FORMAT
 * with that row's format/depth in renderTargets.ts, and the two can't drift apart.
 */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { BodyRuntime } from './@types/BodyRuntime';
import type { BodyFacts } from './@types/BodyFacts';
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
import { createSurfaceTileStream } from './subsystems/surfaceTiles/surfaceTileStream';
import { IDLE_SURFACE_TILE_PLAN } from './subsystems/surfaceTiles/idleSurfaceTilePlan';
import { throttleWithTrailingCall } from '../../utils/throttle/throttleWithTrailingCall';

/** The rate every textual DebugPanel readout refreshes at. */
const READOUT_INTERVAL_MS = 250;

export function create(deps: LayerCoreDeps<BodyFacts>): BodyRuntime {
  const { device } = deps.ctx;
  const reversedZ = SLAB_REVERSED_Z[NEAR0]!;
  const renderers = {
    earthRenderer: createEarthRenderer(
      device,
      HDR_TARGET_FORMAT,
      FOREGROUND_DEPTH_FORMAT,
      reversedZ,
    ),
    surfaceTileRenderer: createSurfaceTileRenderer(
      device,
      HDR_TARGET_FORMAT,
      FOREGROUND_DEPTH_FORMAT,
      reversedZ,
      SURFACE_TILE_MESH_RESOLUTION,
    ),
    terrainPickMarkerRenderer: createTerrainPickMarkerRenderer(
      device,
      HDR_TARGET_FORMAT,
      FOREGROUND_DEPTH_FORMAT,
      reversedZ,
    ),
    texturedBodyRenderer: createTexturedBodyRenderer(
      device,
      HDR_TARGET_FORMAT,
      FOREGROUND_DEPTH_FORMAT,
      reversedZ,
    ),
    planetRenderer: createPlanetRenderer(
      device,
      HDR_TARGET_FORMAT,
      FOREGROUND_DEPTH_FORMAT,
      reversedZ,
    ),
    ringRenderer: createRingRenderer(device, HDR_TARGET_FORMAT, FOREGROUND_DEPTH_FORMAT, reversedZ),
    cloudShellRenderer: createCloudShellRenderer(
      device,
      HDR_TARGET_FORMAT,
      FOREGROUND_DEPTH_FORMAT,
      reversedZ,
    ),
    atmosphereShellRenderer: createAtmosphereShellRenderer(
      device,
      HDR_TARGET_FORMAT,
      ATMOSPHERE_PARAMS,
    ),
    bodyGlintRenderer: createBodyGlintRenderer(device, HDR_TARGET_FORMAT),
  };
  return {
    ...renderers,
    textureSlots: createBodyTextureSlots(renderers),
    atlasSlot: createBodyTextureAtlasSlot(renderers),
    // Free until a plan engages it: the stream allocates its atlases on the first `engage`.
    surfaceTiles: {
      stream: createSurfaceTileStream({ device, requestRender: deps.requestRender }),
      plan: IDLE_SURFACE_TILE_PLAN,
    },
    publish: deps.publish,
    // The trailing wake runs the frame that publishes a turned-away readout, so the
    // last state before the loop sleeps still reaches the panel.
    readoutGate: throttleWithTrailingCall(READOUT_INTERVAL_MS, deps.requestRender),
    debugPanelOpen: () => deps.store.getState().ui.debugPanelOpen,
  };
}
