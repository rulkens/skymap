/**
 * tweenToStructure — kick off a focus camera tween toward a structure.
 *
 * Companion to `tweenToGalaxy`; differs only in where the target distance comes
 * from (`structureFocusDistance` fed the structure's apparent radius rather than
 * a galaxy's diameter).
 *
 * No-op when `state.cam` is null — matches `tweenToGalaxy`'s pre-bootstrap /
 * post-destroy contract. The selection-side update + URL-callback fan-out happen
 * in the caller (`commitStructureFocus`) unconditionally, so a cam-null commit
 * still lands the selection even when this tween skips.
 *
 * `from` reads `state.cameraRuntime.lastPose.current` for the same reason as
 * `tweenToGalaxy`: at rest it equals `poseOf(cam)`, but mid-tween it is the
 * visible interpolated position. Seeding from the live produced pose avoids a
 * jump when the user re-focuses rapidly during an animation.
 *
 * `requestRender` is called explicitly after the dispatch as a direct,
 * synchronous wake. The `camera/*` write also wakes the loop via the
 * `watchWake` saga; the explicit call does not depend on saga ordering — same
 * rationale as `tweenToGalaxy`.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { StructureInfo } from '../../../@types/data/structure/StructureInfo';
import type { AppStore } from '../../../store/types';
import { FOCUS_TWEEN_MS } from './focusTweenDuration';
import { structureFocusDistance } from './structureFocusDistance';
import { startCameraTween } from '../../../state/camera/cameraSlice';

export function tweenToStructure(
  state: EngineState,
  structure: StructureInfo,
  store: AppStore,
): void {
  const cam = state.cam;
  if (!cam) return;

  // Frame on the WIDER apparent extent — the radius the close-approach fade
  // reads — so the framing lands the ring + label just past their fade-out.
  // Falls back to the physical core for structures with no wider extent.
  const radius = structure.apparentRadiusMpc ?? structure.physicalRadiusMpc;

  // Read the live produced pose as the tween's `from`. `lastPose.current` is
  // the pose the user actually sees; at rest it equals `poseOf(cam)`, but
  // mid-tween it is the interpolated position rather than the stale drag register.
  const from = state.cameraRuntime.lastPose.current;

  store.dispatch(
    startCameraTween({
      from,
      to: {
        target: [structure.worldPos[0], structure.worldPos[1], structure.worldPos[2]],
        yaw: from.yaw,
        pitch: from.pitch,
        // fovY drives the screen-fill framing — same value the projection uses.
        distance: structureFocusDistance(radius, state.cameraRuntime.projection.fovYRad),
      },
      durationMs: FOCUS_TWEEN_MS,
      easing: 'easeOutCubic',
    }),
  );

  // Direct wake for the first tween frame — see the module header. The
  // `camera/*` dispatch also wakes the loop via `watchWake`.
  state.subsystems.scheduler.requestRender();
}
