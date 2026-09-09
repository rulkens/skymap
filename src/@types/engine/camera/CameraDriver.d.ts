/**
 * CameraDriver — camera precedence as DATA: the resolver calls only the
 * highest-priority active driver's `pose` (single writer, no blending).
 * Ranking clip 95 > orbitDrag 80 > tween 60 > autoRotate 20 > followBody 10 >
 * resting 0; the gaps are renumber-free headroom, `resting` is always active so
 * a winner always exists, and followBody sits BELOW autoRotate on purpose — a
 * body focus pins the pivot, but autoRotate or a drag still own the orbit terms.
 */

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
  pose(s: RootState, elapsedMs: number): FramedCameraPose;
};
