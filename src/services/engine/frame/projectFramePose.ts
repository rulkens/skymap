/**
 * projectFramePose — the produced pose projected for the draw, and THE FOLD.
 * ORDER IS THE CONTRACT (spec §7 steps 5-6, FW-G): pin → `noteBody` → tilt
 * projection → world arm → regime flip → crossing commit. The fold sits below
 * every pose writer because a fold above one is discarded by whatever writes
 * after it; the tilt projection sits between the pin and the fold so the
 * engage edge converts the image already on screen (ruling 13). The AUTHORED
 * register comes back beside the DISPLAYED pose — the projection reaches the
 * register on no path (R12b-1), which keeps the produce→pin→project loop dead.
 */

import type { UnknownAction } from '@reduxjs/toolkit';

import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { CameraState } from '../../../@types/camera/CameraState';
import type { CameraTuning } from '../../../@types/camera/CameraTuning';
import type { FollowMemory } from '../../../@types/engine/camera/FollowMemory';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { SurfaceMemory } from '../../../@types/camera/SurfaceMemory';
import type { Vec3 } from '../../../@types/math/Vec3';

import { noteBody } from '../../camera/surfaceStep';
import { applyFocusedBodyPivot } from '../camera/applyFocusedBodyPivot';
import { approachTiltedPose } from '../camera/approachTiltedPose';
import { resolveWorldArm, toBodyArm } from '../camera/poseFrameConversion';
import { regimeArmFor } from '../camera/regimeArmFor';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import { eyeMpcOf } from '../../../utils/camera/eyeMpcOf';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { normalize3 } from '../../../utils/math/normalize3';
import { commitCameraPose } from '../../../state/camera/cameraSlice';

/** The pin's strafe while no follow memory exists. */
const NO_PAN: Vec3 = [0, 0, 0];

export function projectFramePose(args: {
  readonly render: FramedCameraPose;
  readonly authoredOverride: FramedCameraPose | null;
  readonly pivotsOnFocusedBody: boolean;
  readonly focus: SelectionRow | null;
  readonly follow: FollowMemory | null;
  readonly surface: SurfaceMemory;
  /** The frame's effective camera intent: `base.frame` IS the regime, `dragging` skips the fold. */
  readonly intent: CameraState;
  readonly bodies: ReadonlyMap<BodyId, BodyState>;
  readonly poseBasis: Mat3;
  readonly upBasis: Mat3;
  readonly tuning: CameraTuning;
}): {
  readonly register: FramedCameraPose;
  readonly displayed: FramedCameraPose;
  readonly surface: SurfaceMemory;
  /** The world arm the frame draws — pre-flip on a crossing frame. */
  readonly world: CameraPose;
  readonly actions: readonly UnknownAction[];
  readonly requestRender: boolean;
} {
  const {
    render,
    authoredOverride,
    pivotsOnFocusedBody,
    focus,
    follow,
    surface,
    intent,
    bodies,
    poseBasis,
    upBasis,
    tuning,
  } = args;

  // The pin SETS the target (never adds), so baking the displayed pose into
  // `base` on the next edge cannot double-apply the body translation. A pan
  // strafe rides the follow memory's `panOffset` (world frame) so the shifted
  // pivot still translate-follows the body.
  let displayed = applyFocusedBodyPivot(
    render,
    pivotsOnFocusedBody,
    focus,
    bodies,
    follow?.panOffset ?? NO_PAN,
  );
  // Post-pin, PRE-projection (R12b-1).
  let register = authoredOverride ?? displayed;
  // The body the tilt memory belongs to: the ENGAGED one while a body arm holds
  // (a differing focus has already released it), else the FOCUSED one.
  const regime = intent.base.frame;
  const noted = noteBody(
    surface,
    regime !== 'absolute' ? regime.body : focus?.type === 'body' ? focus.id : null,
  );
  displayed = approachTiltedPose(
    displayed,
    pivotsOnFocusedBody,
    focus,
    bodies,
    noted.rememberedTiltRad,
    poseBasis,
    upBasis,
    tuning,
  );

  // The register stays FRAMED; every world-Mpc reader takes this value.
  const world = resolveWorldArm(displayed, bodies, poseBasis, upBasis);

  const actions: UnknownAction[] = [];
  let requestRender = false;
  // No flip during a gesture (ruled, Q6): skipped WHOLE — not clamped, not
  // latched — and re-evaluated at gesture end.
  if (!intent.dragging) {
    // `base.frame` IS the regime (spec §4), not the arm this frame's winner
    // authored: `tween` and `clip` are not arm-gated, so the produced pose
    // would re-engage every frame of an animation inside the band.
    const eyeMpc = eyeMpcOf(world, poseBasis);
    // The focused body constrains the regime (round 10).
    const arm = regimeArmFor(
      regime,
      eyeMpc,
      bodies,
      focus?.type === 'body' ? focus.id : null,
      tuning,
    );
    if (arm === 'absolute') {
      if (displayed.frame !== 'absolute') {
        // Disengage commits target-at-centre, eye preserved: the pivot pin
        // re-reads an absolute `target` as the body's centre one frame later
        // and rebuilds the eye from `target + dir·distance`, so committing
        // `world`'s on-ray surface target verbatim teleported the eye one body
        // radius inward (pop-2). Zoom-driven recessions cross at tilt 0, so
        // this is view-exact; other crossings re-aim by at most the remaining
        // tilt on the flip frame.
        const centreMpc = bodies.get(displayed.frame.body)!.positionMpc;
        const toCentre: Vec3 = [
          centreMpc[0] - eyeMpc[0],
          centreMpc[1] - eyeMpc[1],
          centreMpc[2] - eyeMpc[2],
        ];
        const { yaw, pitch } = orbitAnglesLookingAlong(normalize3(toCentre), poseBasis);
        displayed = absoluteArm({
          target: [centreMpc[0], centreMpc[1], centreMpc[2]],
          yaw,
          pitch,
          distance: Math.hypot(toCentre[0], toCentre[1], toCentre[2]),
          roll: world.roll,
        });
        // Centre-looking, so authored and displayed coincide.
        register = displayed;
      }
    } else if (displayed.frame === 'absolute') {
      // Total: `regimeArmFor` only names a body it resolved out of THIS map.
      const bodyState = bodies.get(arm.body)!;
      displayed = {
        frame: arm,
        pose: toBodyArm(world, poseBasis, upBasis, arm.body, bodyState),
      };
      // Engage converts the DISPLAYED pose (ruling 13); on the body arm the
      // tilt is geometry, not a projection, so the register holds it too.
      register = displayed;
    }
    // Once per crossing. The wake is the fold's own: `shouldKeepTicking` reads
    // the pre-fold snapshot, so a flip that quiets the last live term would
    // otherwise park the loop.
    if ((arm === 'absolute' ? null : arm.body) !== (regime === 'absolute' ? null : regime.body)) {
      actions.push(commitCameraPose(displayed));
      requestRender = true;
    }
  }

  return { register, displayed, surface: noted, world, actions, requestRender };
}
