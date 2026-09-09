/**
 * surfaceController — the body arm's gesture register (spec §6). Everything
 * runs in body-fixed metres and reads no world position, so a fast clock
 * cannot slide the ground under a gesture. What the cursor is over picks the
 * control model; every mode moves the pose so the grabbed content follows the
 * cursor, which fixes each sign below. One orientation authority (R1): gestures
 * never create roll; every zoom notch walks heading north and roll level by one
 * bounded decay. Tilt is Cesium-style (ruling 12): display = `remembered ×
 * bodyUpWeight(h/R)`; only the tilt/look handles write the memory.
 */

import type { SurfaceController } from '../../@types/camera/SurfaceController';
import type { SurfaceGesture } from '../../@types/camera/SurfaceGesture';
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

export function createSurfaceController(): SurfaceController {
  // `null` ⇔ no pointer is down. The inner gesture stays null until the first
  // drag step, the first input carrying the press pixel a latch needs; nesting
  // them makes "latched with the pointer up" — FW-C's trackpad burst —
  // unrepresentable rather than guarded.
  let live: { gesture: SurfaceGesture | null } | null = null;
  // Ruling 12's remembered tilt, ONE home. A body SWITCH wipes it (ruling 18:
  // never restored per body); a null note — nothing engaged or focused — keeps it.
  let rememberedTiltRad = 0;
  let memoryBodyId: string | null = null;

  return {
    noteBody: (bodyId) => {
      if (bodyId === null) return;
      if (memoryBodyId !== null && memoryBodyId !== bodyId) rememberedTiltRad = 0;
      memoryBodyId = bodyId;
    },
    onGestureStart: () => {
      live = { gesture: null };
    },
    onGestureEnd: () => {
      live = null;
    },
    debugGesture: () => live,
    rememberedTiltRad: () => rememberedTiltRad,
    apply: (arm, step, viewportPx, fovYRad, bodyRadiusM, sceneUpLocal) => {
      if (step.kind === 'zoom') {
        return surfaceZoomStep(
          arm,
          live?.gesture ?? null,
          step.factor,
          step.cursorPx,
          viewportPx,
          fovYRad,
          bodyRadiusM,
          sceneUpLocal,
          rememberedTiltRad,
        );
      }
      // The gesture boundaries reach the controller through the two callbacks;
      // `drainInput` owns their store edges in the same pass.
      if (step.kind !== 'drag' || live === null) return arm;
      const gesture =
        live.gesture ?? latchSurfaceGesture(arm, step, viewportPx, fovYRad, bodyRadiusM);
      // The step's ENTRY orientation: the tilt the wall grandfathers, and the
      // heading pan transports. Drags level against the PURE body ENU — the
      // band blend is the zoom's authority; a drag-created deviation from the
      // blend is "unauthored" and the next notch's decay settles it.
      const preInPoleFrame = eyeFrameOf(arm, 1, BODY_LOCAL_FRAME.pole);
      const { pose, mode } = draggedSurfacePose(arm, gesture, step, viewportPx, fovYRad);
      live.gesture = { ...gesture, mode, prevPixel: step.endPx };
      // One floor site, after every position write — `anchoredZoomStep` owns
      // its own, so the zoom arm above is already floored. The wall and the
      // level run on the FLOORED pose: the floor moves the eye radially, and
      // the ENU they settle against has to be the final standpoint.
      const walled = walledTiltPose(
        flooredBodyPose(pose, bodyRadiusM),
        preInPoleFrame?.tiltRad ?? 0,
        bodyRadiusM,
        rememberedTiltRad,
      );
      // Drags stay heading-free (ruled) — only zoom writes walk north up — but
      // no drag may ROLL: pan and orbit hold the heading they entered with
      // (the transport that makes holonomy unrepresentable), look and tilt
      // level around the heading they authored. Strafe translates with its
      // basis untouched — a known small hole in the no-roll rule: it lives in
      // a few-pixel grazing-incidence latch window at the limb, where a
      // standpoint translation does turn the ENU (~0.03 rad over 30 steps at
      // the boundary, measured); the next pan or notch settles the residual.
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
      if (mode === 'tilt' || mode === 'look') {
        const f = eyeFrameOf(final, 1, BODY_LOCAL_FRAME.pole);
        const hr = Math.hypot(...bodyFixedEyeM(final)) / bodyRadiusM - 1;
        if (f !== null && bodyUpWeight(hr) > 1e-6) {
          rememberedTiltRad = Math.min(unmappedTiltRad(f.tiltRad, hr), SURFACE_REGIME.tiltMaxRad);
        }
      }
      return final;
    },
  };
}
