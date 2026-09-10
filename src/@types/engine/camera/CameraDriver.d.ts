/**
 * CameraDriver — one row of the camera precedence table; the ranking and its
 * rationale live with the table itself (`cameraDrivers.ts`).
 */

import type { DriverCtx } from './DriverCtx';
import type { FollowMemory } from './FollowMemory';
import type { FramedCameraPose } from '../../camera/FramedCameraPose';
import type { RootState } from '../../../store/types';

export type CameraDriver = {
  readonly id: string;
  readonly priority: number;
  // Set when this driver's final pose must bake into `camera.base` as it
  // DEACTIVATES, so the frame loop freezes the saturated pose instead of
  // snapping back to the previous base.
  readonly commitsOnEdge?: boolean;
  // Set by drivers that author ORBIT terms (yaw / pitch / distance around a
  // target): the frame loop re-centres their `target` on the focused scene body
  // (`applyFocusedBodyPivot`). clip / tween keyframe a full path, target
  // included, and leave this unset so their own target is honoured.
  readonly pivotsOnFocusedBody?: boolean;
  isActive(s: RootState): boolean;
  // Takes the frame as values and RETURNS its memory: a row that owns none
  // hands `mem` straight back, so the winner's adoption needs no branch.
  pose(
    ctx: DriverCtx,
    mem: FollowMemory | null,
  ): { readonly pose: FramedCameraPose; readonly memory: FollowMemory | null };
};
