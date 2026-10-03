import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { SettleCtx } from '../../@types/camera/SettleCtx';
import type { SurfaceGesture } from '../../@types/camera/SurfaceGesture';
import type { TiltMemory } from '../../@types/camera/TiltMemory';
import { BODY_LOCAL_FRAME } from '../../data/camera/bodyLocalFrame';
import { MAX_REMEMBERED_TILT_RAD } from '../../data/camera/cameraTuning';
import { ORIENT_DECAY } from '../../data/camera/orientDecay';
import { bodyFixedEyeM } from './bodyFixedEyeM';
import { bodyUpWeight } from './bodyUpWeight';
import { eyeFrameOf } from './eyeFrameOf';
import { flooredBodyPose } from './flooredBodyPose';
import { levelledPose } from './levelledPose';
import { unmappedTiltRad } from './unmappedTiltRad';

/**
 * The body arm's post-move settle, in its one order: floor → level → tilt
 * memory. The level runs on the FLOORED pose because the floor moves the eye
 * radially and the ENU it settles against has to be the final standpoint.
 * Drags level against the PURE body ENU; a drag-created deviation from the
 * zoom's band blend is "unauthored" and the next notch's decay settles it.
 */
export function settledDragPose(
  entry: BodyFixedPose,
  moved: BodyFixedPose,
  mode: SurfaceGesture['mode'],
  tilt: TiltMemory,
  ctx: SettleCtx,
): { pose: BodyFixedPose; tilt: TiltMemory } {
  const { groundRadiusAtM, standoffRadii, bodyRadiusM, tuning } = ctx;
  // The ENTRY heading, which pan transports.
  const preInPoleFrame = eyeFrameOf(entry, 1, BODY_LOCAL_FRAME.pole);
  // No pivot: a drag serves its own gesture anchor, not the focus, and the
  // tilt handle already spends its floor budget before reaching here.
  const floored = flooredBodyPose(moved, groundRadiusAtM, standoffRadii, null);
  // Drags stay heading-free (ruled) — only zoom walks north up — but no drag
  // may ROLL: pan and orbit hold their entry heading (the transport that makes
  // holonomy unrepresentable), look and tilt level around the heading they
  // authored. Strafe translates with its basis untouched, a known small hole in
  // the no-roll rule: it lives in a few-pixel grazing-incidence latch window at
  // the limb (~0.03 rad over 30 steps, measured), settled by the next notch.
  const final =
    mode === 'strafe' || preInPoleFrame === null
      ? floored
      : levelledPose(floored, {
          blendW: 1,
          sceneUpLocal: BODY_LOCAL_FRAME.pole,
          heldAzimuthRad: mode === 'pan' || mode === 'orbit' ? preInPoleFrame.azimuthRad : null,
          pivotM: null,
          capRad: ORIENT_DECAY.dragLevelCapRad,
        });
  // Ruling 12: tilt-authoring handles update the memory. Un-mapping through
  // the band weight keeps the just-set display a FIXED POINT of the zoom
  // mapping — a notch at the set altitude must not move it (zoom never authors
  // tilt). Near w → 0 the ratio diverges: `MAX_REMEMBERED_TILT_RAD` is the only
  // cap on the memory, and a degenerate weight leaves it untouched.
  let rememberedTiltRad = tilt.rememberedTiltRad;
  if (mode === 'tilt' || mode === 'look') {
    const f = eyeFrameOf(final, 1, BODY_LOCAL_FRAME.pole);
    const hr = Math.hypot(...bodyFixedEyeM(final)) / bodyRadiusM - 1;
    if (f !== null && bodyUpWeight(hr, tuning) > 1e-6) {
      rememberedTiltRad = Math.min(unmappedTiltRad(f.tiltRad, hr, tuning), MAX_REMEMBERED_TILT_RAD);
    }
  }
  return { pose: final, tilt: { ...tilt, rememberedTiltRad } };
}
