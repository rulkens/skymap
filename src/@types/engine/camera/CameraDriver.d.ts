/** CameraDriver — one precedence-table row; the ranking and its why live with the table. */

import type { DriverCtx } from './DriverCtx';
import type { FollowMemory } from './FollowMemory';
import type { FramedCameraPose } from '../../camera/FramedCameraPose';
import type { RootState } from '../../../store/types';

export type CameraDriver = {
  readonly id: string;
  readonly priority: number;
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
