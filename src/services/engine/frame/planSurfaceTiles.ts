/**
 * planSurfaceTiles — the surface-tile planner over the rig's views: the cut
 * across every view that holds the engaged body, the atlas release on pull-back,
 * and the wake vote. Takes the subsystem as a parameter, never off `state`, so
 * a Layer can register it closed over its own runtime.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { SurfaceTileSubsystem } from '../../../@types/engine/subsystems/SurfaceTileSubsystem';
import type { PlannerResult } from '../../../@types/engine/frame/PlannerResult';
import type { SurfaceCutTile } from '../../../@types/scene/SurfaceCutTile';
import { planSurfaceCut } from './planSurfaceCut';
import { releaseTilesPastRadius } from './releaseTilesPastRadius';

export function planSurfaceTiles(
  tiles: SurfaceTileSubsystem,
  views: readonly FrameView[],
  state: PassState,
): PlannerResult<readonly SurfaceCutTile[]> {
  const cut = planSurfaceCut(tiles, views, state);
  releaseTilesPastRadius(tiles, views, state);

  // Outside the engagement: `isAnimating()` is true while the manifest is in
  // flight, before the layer can engage — voting only on engaged frames would
  // sleep the loop mid-fetch.
  return { value: cut, awake: tiles.isAnimating(), settling: false };
}
