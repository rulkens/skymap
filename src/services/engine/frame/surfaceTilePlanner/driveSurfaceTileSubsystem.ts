/**
 * driveSurfaceTileSubsystem — the live tile path until `runFrame` applies
 * `planSurfaceTiles`' plan (P8b): the cut across every view that engages a
 * tiling body, the atlas release on pull-back, and the wake vote, decided
 * inside the subsystem.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { SurfaceTileSubsystem } from '../../../../@types/engine/subsystems/SurfaceTileSubsystem';
import type { SceneBodyId } from '../../../../@types/scene/SceneBodyId';
import type { SurfaceTileBodyId } from '../../../../@types/data/SurfaceTileBodyId';
import type { PlannerResult } from '../../../../@types/engine/frame/PlannerResult';
import type { SurfaceCutTile } from '../../../../@types/scene/SurfaceCutTile';
import type { Tier } from '../../../../@types/data/Tier';
import { planSurfaceCut } from './planSurfaceCut';
import { releaseTilesPastRadius } from './releaseTilesPastRadius';

export function driveSurfaceTileSubsystem(
  tiles: SurfaceTileSubsystem,
  views: readonly FrameView[],
  committedTier: (bodyId: SceneBodyId & SurfaceTileBodyId) => Tier,
): PlannerResult<readonly SurfaceCutTile[]> {
  const cut = planSurfaceCut(tiles, views, committedTier);
  releaseTilesPastRadius(tiles, views);

  // Outside the engagement: `isAnimating()` is true while the manifest is in
  // flight, before the layer can engage — voting only on engaged frames would
  // sleep the loop mid-fetch.
  return { value: cut, awake: tiles.isAnimating(), settling: false };
}
