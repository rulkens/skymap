/**
 * tweenToPoi — kick off a focus camera tween toward a POI.  Companion
 * to `tweenToGalaxy`; differs only in where the target distance comes
 * from (per-category framing via `poiFocusDistance`, fed the POI's
 * physical radius rather than a galaxy's diameter).
 *
 * No-op when `state.cam` is null — matches `tweenToGalaxy`'s
 * pre-bootstrap / post-destroy contract.  The selection-side update
 * + URL-callback fan-out happen in the caller (`commitPoiFocus`)
 * unconditionally, so a cam-null commit still lands the selection
 * even when this tween skips.
 */

import { vec3 } from 'gl-matrix';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { PointOfInterest } from '../../../@types/engine/subsystems/PointOfInterest';
import { FOCUS_TWEEN_MS } from './focusTweenDuration';
import { poiFocusDistance } from './poiFocusDistance';

export function tweenToPoi(state: EngineState, poi: PointOfInterest): void {
  const cam = state.cam;
  if (!cam) return;

  // POIs without a physicalRadiusMpc are treated as zero radius by
  // poiFocusDistance, which clamps to the 1 Mpc minimum.  Every
  // cluster / SC / void POI sets the field in practice; the fallback
  // is belt-and-braces for synthetic / future categories.
  const radius = poi.physicalRadiusMpc ?? 0;
  state.subsystems.tweens.start({
    startMs: performance.now(),
    durationMs: FOCUS_TWEEN_MS,
    // vec3.clone copies the target tuple so later mutation of
    // cam.target (next-frame orbit-controls update, an interrupting
    // tween) doesn't corrupt the from-snapshot.
    fromTarget: vec3.clone(cam.target as vec3),
    toTarget: vec3.fromValues(poi.worldPos[0], poi.worldPos[1], poi.worldPos[2]),
    fromDistance: cam.distance,
    toDistance: poiFocusDistance(poi.category, radius),
    // Yaw and pitch preserved — the user keeps their orientation;
    // only the orbit target and distance change.
    fromYaw: cam.yaw,
    toYaw: cam.yaw,
    fromPitch: cam.pitch,
    toPitch: cam.pitch,
  });
  // Wake the render loop — the tween's per-frame advance keeps it
  // ticking via the still-animating predicate until completion.
  state.subsystems.scheduler.requestRender();
}
