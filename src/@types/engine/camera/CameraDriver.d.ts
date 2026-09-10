/** CameraDriver — one precedence-table row; the ranking and its why live with the table. */

import type { DriverCtx } from './DriverCtx';
import type { EpochRow } from './EpochRow';
import type { FollowMemory } from './FollowMemory';
import type { FramedCameraPose } from '../../camera/FramedCameraPose';
import type { RootState } from '../../../store/types';

export type CameraDriver = {
  readonly id: string;
  readonly priority: number;
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
  // `approachDone` = the follow memory saturated last frame; only `followApproach` reads it.
  isActive(s: RootState, approachDone?: boolean): boolean;
  // A row that owns no memory hands `mem` back, so the winner's adoption needs no branch.
  pose(
    ctx: DriverCtx,
    mem: FollowMemory | null,
  ): { readonly pose: FramedCameraPose; readonly memory: FollowMemory | null };
};
