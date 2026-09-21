/**
 * wireImpostorSubsystems — the four galaxy-thumbnail subsystems, with the atlas
 * view bound into the textured-disk renderer, returned for `create` to park on
 * the runtime. Construction order is a dependency order, not a preference: see
 * the comments at each step.
 */

import { createGalaxyAtlasSubsystem } from '../subsystems/galaxyAtlasSubsystem';
import { createProceduralDiskSubsystem } from '../subsystems/proceduralDiskSubsystem';
import { createTexturedDiskSubsystem } from '../subsystems/texturedDiskSubsystem';
import { createDiskPlannerWalk } from '../subsystems/diskPlannerWalk';

import type { TileStreamSubsystem } from '../../../@types/engine/subsystems/tileStreamSubsystem/TileStreamSubsystem';
import type { DiskPlannerWalk } from '../../../@types/engine/subsystems/DiskPlannerWalk';
import type { ProceduralDiskSubsystem } from '../../../@types/engine/subsystems/proceduralDiskSubsystem/ProceduralDiskSubsystem';
import type { TexturedDiskSubsystem } from '../../../@types/engine/subsystems/texturedDiskSubsystem/TexturedDiskSubsystem';
import type { TexturedDiskRenderer } from '../../../@types/rendering/TexturedDiskRenderer';

export function wireImpostorSubsystems(deps: {
  readonly device: GPUDevice;
  readonly requestRender: () => void;
  readonly texturedDiskRenderer: TexturedDiskRenderer;
}): {
  readonly galaxyAtlas: TileStreamSubsystem<ImageBitmap>;
  readonly texturedDisks: TexturedDiskSubsystem;
  readonly proceduralDisks: ProceduralDiskSubsystem;
  readonly diskPlannerWalk: DiskPlannerWalk;
} {
  // galaxyAtlas first: the texturedDisk planner subscribes to its eviction
  // notifications and uses it for slot allocation.
  const galaxyAtlas = createGalaxyAtlasSubsystem({
    device: deps.device,
    requestRender: deps.requestRender,
  });

  const texturedDisks = createTexturedDiskSubsystem({ device: deps.device, atlas: galaxyAtlas });

  // proceduralDisks depends on the atlas for the famous-WebP fade-out: for
  // Famous-source galaxies whose curated WebP has loaded into the atlas, the
  // procedural pattern crossfades out across the textured-disk fade-IN band so
  // it doesn't bleed through the photo.
  const proceduralDisks = createProceduralDiskSubsystem({ atlas: galaxyAtlas });

  // The single shared catalog walk that drives BOTH planners' visitors each
  // frame — one stride cursor, each row's geometry computed once. Default
  // decimation (8): the walk visits 1/8 of each catalog per frame, the
  // planners' sticky maps carry the rest.
  const diskPlannerWalk = createDiskPlannerWalk({});

  // Half of the renderer's `composeAtlasBindGroup()` gate — the `hiResFamous`
  // slot's commit fires the other half, and until both land the textured-disk
  // pipeline has no bind group and skips every draw call.
  deps.texturedDiskRenderer.bindAtlas(galaxyAtlas.getTextureView());

  return { galaxyAtlas, texturedDisks, proceduralDisks, diskPlannerWalk };
}
