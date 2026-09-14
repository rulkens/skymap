/**
 * wireImpostorSubsystems — constructs the galaxy-thumbnail GPU subsystems
 * and wires them into the textured-disk renderer. Called from `wireSlots`,
 * the one call site, which narrows the disk renderer non-null before
 * calling — it exists as a compile-time fact here, not a runtime check.
 *
 * Construction order: galaxyAtlas must exist before texturedDisks, which
 * depends on it; proceduralDisks is independent.
 */

import { createGalaxyAtlasSubsystem } from '../subsystems/galaxyAtlasSubsystem';
import { createProceduralDiskSubsystem } from '../subsystems/proceduralDiskSubsystem';
import { createTexturedDiskSubsystem } from '../subsystems/texturedDiskSubsystem';
import { createDiskPlannerWalk } from '../subsystems/diskPlannerWalk';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { TexturedDiskRenderer } from '../../../@types/rendering/TexturedDiskRenderer';

/**
 * Build the four impostor subsystems and assign them onto
 * `state.subsystems.*`.  Also binds the atlas view into the textured-disk
 * renderer so the LOD-2 pass can draw.
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

  // The LOD-3 planner arrives later, through the `hiResFamous` asset slot: its
  // texture is sized per tier and WebGPU textures are immutable in shape, so its
  // lifetime belongs to the demand loop.  Until that slot's first commit — a frame
  // or two after boot — every Famous-source disk carries the -1 / 0 sentinel and
  // the fragment shader takes the atlas-tile-only path.
  const texturedDisks = createTexturedDiskSubsystem({
    device,
    atlas: galaxyAtlas,
    hiResFamous: undefined,
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
  // view; proceduralDiskRenderer doesn't sample it.  The renderer's
  // `composeAtlasBindGroup()` gate also waits on `bindHiResArray`, which the
  // `hiResFamous` slot's commit fires — until both have landed the textured-disk
  // pipeline has no bind group and skips every draw call.
  texturedDiskRenderer.bindAtlas(galaxyAtlas.getTextureView());

  // ── State writes ──────────────────────────────────────────────────────
  state.subsystems.galaxyAtlas = galaxyAtlas;
  state.subsystems.texturedDisks = texturedDisks;
  state.subsystems.proceduralDisks = proceduralDisks;
  state.subsystems.diskPlannerWalk = diskPlannerWalk;
}
