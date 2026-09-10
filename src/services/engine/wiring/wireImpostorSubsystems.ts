/**
 * wireImpostorSubsystems — constructs the galaxy-thumbnail GPU subsystems
 * and wires them into the textured-disk renderer. Called from `wireSlots`,
 * the one call site, which narrows the disk renderer non-null before
 * calling — it exists as a compile-time fact here, not a runtime check.
 *
 * Construction order: galaxyAtlas + the LOD-3 hi-res planner must exist
 * before texturedDisks (which depends on both); proceduralDisks is
 * independent.
 */

import { createGalaxyAtlasSubsystem } from '../subsystems/galaxyAtlasSubsystem';
import { createProceduralDiskSubsystem } from '../subsystems/proceduralDiskSubsystem';
import { createTexturedDiskSubsystem } from '../subsystems/texturedDiskSubsystem';
import { createDiskPlannerWalk } from '../subsystems/diskPlannerWalk';
import { createHiResFamousSubsystem } from '../subsystems/hiResFamousSubsystem';
import { createHiResFamousTexture } from '../../gpu/resources/hiResFamousTexture';
import { HI_RES_LAYER_COUNT, HI_RES_LAYER_SIDE_BY_TIER } from '../../../data/sources';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { TexturedDiskRenderer } from '../../../@types/rendering/TexturedDiskRenderer';

/**
 * Build the five impostor subsystems and assign them onto
 * `state.subsystems.*`.  Also binds the atlas and hi-res array views
 * into the textured-disk renderer so the LOD-2/LOD-3 pass can draw.
 */
export function wireImpostorSubsystems(
  state: EngineState,
  device: GPUDevice,
  disks: {
    readonly texturedDiskRenderer: TexturedDiskRenderer;
  },
): void {
  const { texturedDiskRenderer } = disks;

  // ── Dependency-ordered construction ──────────────────────────────────
  //
  // galaxyAtlas first: the texturedDisk planner subscribes to its eviction
  // notifications and uses it for slot allocation.
  const galaxyAtlas = createGalaxyAtlasSubsystem({
    device,
    requestRender: () => state.subsystems.scheduler.requestRender(),
  });

  // LOD-3 hi-res Famous-galaxy resources.  The texture's per-layer edge
  // length depends on the current tier — mobile/"small" gets 512 px (GPU
  // memory budget), desktop tiers get 1024 px.  Sized once at boot; a
  // tier change destroys this pair and re-creates it at the new layerSide
  // via `rebuildHiResFamousForTier`.  `initTexture()` is mandatory before
  // `getTextureView()` — the texture handle throws otherwise.
  const layerSide = HI_RES_LAYER_SIDE_BY_TIER[state.tier];
  const hiResFamousTexture = createHiResFamousTexture({
    device,
    layerSide,
    layerCount: HI_RES_LAYER_COUNT,
  });
  hiResFamousTexture.initTexture();
  const hiResFamous = createHiResFamousSubsystem({
    texture: hiResFamousTexture,
    requestRender: () => state.subsystems.scheduler.requestRender(),
  });

  // texturedDisks depends on both atlas (above) and hiResFamous (above).
  // Passing hiResFamous here enables the LOD-3 path: for Famous-source
  // galaxies past ~200 px apparent diameter, the planner folds
  // `hiResLayerIdx` + `hiResCrossfadeAlpha` into the disk instance buffer.
  // Omitting it (tests, future non-Famous configs) keeps the LOD-3 sentinel
  // at -1/0 so the fragment shader takes the atlas-tile-only path.
  const texturedDisks = createTexturedDiskSubsystem({
    device,
    atlas: galaxyAtlas,
    hiResFamous,
  });

  // proceduralDisks depends on the atlas for the famous-WebP fade-out:
  // for Famous-source galaxies whose curated WebP has loaded into the atlas,
  // the procedural pattern crossfades out across the textured-disk fade-IN
  // band so it doesn't bleed through the photo.  Non-famous galaxies and
  // tests that omit the atlas keep procFadeOut at 1.0.
  const proceduralDisks = createProceduralDiskSubsystem({ atlas: galaxyAtlas });

  // The single shared catalog walk that drives BOTH planners' visitors each
  // frame — one stride cursor, each row's geometry computed once. Default
  // decimation (8): the walk visits 1/8 of each catalog per frame, the
  // planners' sticky maps carry the rest.
  const diskPlannerWalk = createDiskPlannerWalk({});

  // ── Renderer bind wires ───────────────────────────────────────────────
  //
  // Bind the atlas view into the LOD-2 disk renderer.  The atlas owns the
  // view; proceduralDiskRenderer doesn't sample it.
  texturedDiskRenderer.bindAtlas(galaxyAtlas.getTextureView());
  // Bind the hi-res texture_2d_array view.  The renderer's
  // `composeAtlasBindGroup()` gate waits for BOTH `bindAtlas` and
  // `bindHiResArray` before becoming draw-ready — until this fires, the
  // textured-disk pipeline has no bind group and skips every draw call.
  texturedDiskRenderer.bindHiResArray(hiResFamousTexture.getTextureView());

  // ── State writes ──────────────────────────────────────────────────────
  state.subsystems.galaxyAtlas = galaxyAtlas;
  state.subsystems.texturedDisks = texturedDisks;
  state.subsystems.proceduralDisks = proceduralDisks;
  state.subsystems.diskPlannerWalk = diskPlannerWalk;
  state.subsystems.hiResFamous = hiResFamous;
  state.subsystems.hiResFamousTexture = hiResFamousTexture;
}
