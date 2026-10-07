/** CameraDriver — one precedence-table row; the ranking and its why live with the table. */

import type { DriverActivity } from './DriverActivity';
import type { DriverCtx } from './DriverCtx';
import type { DriverId } from './DriverId';
import type { EpochRow } from './EpochRow';
import type { FollowMemory } from './FollowMemory';
import type { FramedCameraPose } from '../../camera/FramedCameraPose';
import type { RootState } from '../../../store/types';

export type CameraDriver = {
  readonly id: DriverId;
  readonly priority: number;
  // This row re-asserts a moving body's target every frame, so it swallows a committed
  // `base`: wheel zoom, the commit edge and the keep-ticking wake treat such rows as one author.
  readonly followsMovingTarget: boolean;
  // The epoch this row's `ctx.elapsedMs` measures on; unset for the rows that
  // read no clock (orbitDrag, resting). Both follow rows name `follow`, so the
  // approach's ease and the hold's saturation share one epoch.
  readonly epoch?: EpochRow;
  // Bake this row's final register into `camera.base` as it DEACTIVATES, so the
  // loop freezes the saturated pose instead of snapping back to the old base.
  readonly commitsOnEdge?: boolean;
  // This row authors ORBIT terms, so `applyFocusedBodyPivot` re-centres its `target`
  // on the focused body; clip / tween keyframe a target of their own and leave it unset.
  readonly pivotsOnFocusedBody?: boolean;
  // This row DELIVERS the framing a focus asks for (it keyframes the whole
  // pose), so it settles the follow approach's debt instead of leaving it owed
  // for the approach to undo at the row's exit.
  readonly deliversFraming?: boolean;
  isActive(s: RootState, activity: DriverActivity): boolean;
  // A row that owns no memory hands `mem` back, so the winner's adoption needs no branch.
  pose(
    ctx: DriverCtx,
    mem: FollowMemory | null,
  ): { readonly pose: FramedCameraPose; readonly memory: FollowMemory | null };
};
