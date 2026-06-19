/**
 * tweenToStructure — kick off a focus camera tween toward a structure.
 * Companion to `tweenToGalaxy`; differs only in where the target distance
 * comes from (screen-fill framing via `structureFocusDistance`, fed the
 * structure's apparent radius rather than a galaxy's diameter).
 *
 * No-op when `state.cam` is null — matches `tweenToGalaxy`'s
 * pre-bootstrap / post-destroy contract.  The selection-side update
 * + URL-callback fan-out happen in the caller (`commitStructureFocus`)
 * unconditionally, so a cam-null commit still lands the selection
 * even when this tween skips.
 */

import { vec3 } from 'gl-matrix';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { StructureInfo } from '../../../@types/data/structure/StructureInfo';
import type { AppStore } from '../../../store/types';
import { FOCUS_TWEEN_MS } from './focusTweenDuration';
import { structureFocusDistance } from './structureFocusDistance';
import { poseOf } from './poseOf';
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
  state.subsystems.tweens.start({
    startMs: performance.now(),
    durationMs: FOCUS_TWEEN_MS,
    // vec3.clone copies the target tuple so later mutation of
    // cam.target (next-frame orbit-controls update, an interrupting
    // tween) doesn't corrupt the from-snapshot.
    fromTarget: vec3.clone(cam.target as vec3),
    toTarget: vec3.fromValues(structure.worldPos[0], structure.worldPos[1], structure.worldPos[2]),
    fromDistance: cam.distance,
    // fovY drives the screen-fill framing — same value the projection uses.
    toDistance: structureFocusDistance(radius, cam.fovYRad),
    // Yaw and pitch preserved — the user keeps their orientation;
    // only the orbit target and distance change.
    fromYaw: cam.yaw,
    toYaw: cam.yaw,
    fromPitch: cam.pitch,
    toPitch: cam.pitch,
  });
  // tweens.start wakes the scheduler; no follow-up requestRender needed.

  // Also record the tween as camera-slice Intent; the slice becomes the
  // read-of-truth once the driver reads it (dual-write bridge).
  store.dispatch(
    startCameraTween({
      from: poseOf(cam),
      to: {
        target: [structure.worldPos[0], structure.worldPos[1], structure.worldPos[2]],
        yaw: cam.yaw,
        pitch: cam.pitch,
        distance: structureFocusDistance(radius, cam.fovYRad),
      },
      durationMs: FOCUS_TWEEN_MS,
      easing: 'easeOutCubic',
    }),
  );
}
