/**
 * surfaceStep — the body arm's gesture register as a pure step over its memory
 * (spec §6). Body-fixed metres, no world position, so a fast clock cannot slide
 * the ground under a gesture; every mode moves the pose so the grabbed content
 * follows the cursor, which fixes each sign below. One orientation authority
 * (R1): gestures never create roll. Tilt is Cesium-style (ruling 12): display =
 * `remembered × bodyUpWeight(h/R)`; only tilt/look write it. Flat `{gesture,
 * pointerDown}` can spell "latched with the pointer up" — the nesting it
 * replaced could not — so the drag arm checks it rather than trusting it.
 */

import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { InputStep } from '../../@types/camera/InputStep';
import type { SurfaceMemory } from '../../@types/camera/SurfaceMemory';
import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';
import { BODY_LOCAL_FRAME } from '../../data/camera/bodyLocalFrame';
import { SURFACE_REGIME } from '../../data/camera/surfaceRegime';
import { bodyFixedEyeM } from '../../utils/camera/bodyFixedEyeM';
import { bodyUpWeight } from '../../utils/camera/bodyUpWeight';
import { draggedSurfacePose } from '../../utils/camera/draggedSurfacePose';
import { eyeFrameOf } from '../../utils/camera/eyeFrameOf';
import { flooredBodyPose } from '../../utils/camera/flooredBodyPose';
import { latchSurfaceGesture } from '../../utils/camera/latchSurfaceGesture';
import { levelledPose } from '../../utils/camera/levelledPose';
import { surfaceZoomStep } from '../../utils/camera/surfaceZoomStep';
import { unmappedTiltRad } from '../../utils/camera/unmappedTiltRad';
import { walledTiltPose } from '../../utils/camera/walledTiltPose';

type SurfaceStepCtx = {
  readonly viewportPx: Readonly<Vec2>;
  readonly fovYRad: number;
  readonly bodyRadiusM: number;
  /** Scene-frame up in BODY-FIXED axes (unit); the body rotates under it, so resample per drain. */
  readonly sceneUpLocal: Readonly<Vec3>;
};

/** The engine's boot value; immutable, so one shared object is fine. */
export const EMPTY_SURFACE_MEMORY: SurfaceMemory = {
  gesture: null,
  pointerDown: false,
  rememberedTiltRad: 0,
  memoryBodyId: null,
};

/** Once per frame with the camera's current body; a DIFFERENT body wipes the tilt (ruling 18), null keeps it. */
export function noteBody(prev: SurfaceMemory, bodyId: string | null): SurfaceMemory {
  if (bodyId === null) return prev;
  const wipe = prev.memoryBodyId !== null && prev.memoryBodyId !== bodyId;
  return { ...prev, rememberedTiltRad: wipe ? 0 : prev.rememberedTiltRad, memoryBodyId: bodyId };
}

export function surfaceStep(
  prev: SurfaceMemory,
  arm: BodyFixedPose,
  step: InputStep,
  ctx: SurfaceStepCtx,
): { readonly pose: BodyFixedPose; readonly next: SurfaceMemory } {
  const { viewportPx, fovYRad, bodyRadiusM, sceneUpLocal } = ctx;
  if (step.kind === 'zoom') {
    return {
      pose: surfaceZoomStep(
        arm,
        prev.pointerDown ? prev.gesture : null,
        step.factor,
        step.cursorPx,
        viewportPx,
        fovYRad,
        bodyRadiusM,
        sceneUpLocal,
        prev.rememberedTiltRad,
      ),
      next: prev,
    };
  }
  // The gesture boundaries reach the memory at `replayInput`'s two gesture edges,
  // as the two `pointerDown` writes; nothing latches here with the pointer up.
  if (step.kind !== 'drag' || !prev.pointerDown) return { pose: arm, next: prev };
  const gesture = prev.gesture ?? latchSurfaceGesture(arm, step, viewportPx, fovYRad, bodyRadiusM);
  // The step's ENTRY orientation: the tilt the wall grandfathers, and the
  // heading pan transports. Drags level against the PURE body ENU — the
  // band blend is the zoom's authority; a drag-created deviation from the
  // blend is "unauthored" and the next notch's decay settles it.
  const preInPoleFrame = eyeFrameOf(arm, 1, BODY_LOCAL_FRAME.pole);
  const { pose, mode } = draggedSurfacePose(arm, gesture, step, viewportPx, fovYRad);
  // One floor site, after every position write — `anchoredZoomStep` owns
  // its own, so the zoom arm above is already floored. The wall and the
  // level run on the FLOORED pose: the floor moves the eye radially, and
  // the ENU they settle against has to be the final standpoint.
  const walled = walledTiltPose(
    flooredBodyPose(pose, bodyRadiusM),
    preInPoleFrame?.tiltRad ?? 0,
    bodyRadiusM,
    prev.rememberedTiltRad,
  );
  // Drags stay heading-free (ruled) — only zoom walks north up — but no drag
  // may ROLL: pan and orbit hold their entry heading (the transport that makes
  // holonomy unrepresentable), look and tilt level around the heading they
  // authored. Strafe translates with its basis untouched, a known small hole in
  // the no-roll rule: it lives in a few-pixel grazing-incidence latch window at
  // the limb (~0.03 rad over 30 steps, measured), settled by the next notch.
  const final =
    mode === 'strafe' || preInPoleFrame === null
      ? walled
      : levelledPose(walled, {
          blendW: 1,
          sceneUpLocal: BODY_LOCAL_FRAME.pole,
          heldAzimuthRad: mode === 'pan' || mode === 'orbit' ? preInPoleFrame.azimuthRad : null,
          pivotM: null,
        });
  // Ruling 12: tilt-authoring handles update the memory. Un-mapping
  // through the band weight keeps the just-set display a FIXED POINT of
  // the zoom mapping — a notch at the set altitude must not move it
  // (zoom never authors tilt). Near w → 0 the ratio diverges: the
  // tiltMaxRad clamp is the sane ceiling, and a degenerate weight leaves
  // the memory untouched (no intent is readable there).
  let rememberedTiltRad = prev.rememberedTiltRad;
  if (mode === 'tilt' || mode === 'look') {
    const f = eyeFrameOf(final, 1, BODY_LOCAL_FRAME.pole);
    const hr = Math.hypot(...bodyFixedEyeM(final)) / bodyRadiusM - 1;
    if (f !== null && bodyUpWeight(hr) > 1e-6) {
      rememberedTiltRad = Math.min(unmappedTiltRad(f.tiltRad, hr), SURFACE_REGIME.tiltMaxRad);
    }
  }
  return {
    pose: final,
    next: { ...prev, gesture: { ...gesture, mode, prevPixel: step.endPx }, rememberedTiltRad },
  };
}
