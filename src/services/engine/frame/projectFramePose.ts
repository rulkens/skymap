/**
 * projectFramePose — the produced pose projected for the draw, and THE FOLD.
 * ORDER IS THE CONTRACT (spec §7 steps 5-6, FW-G): pin → `notedTiltMemory` → tilt
 * projection → world arm → regime flip → crossing commit. The fold sits below
 * every pose writer because a fold above one is discarded by whatever writes
 * after it; the tilt projection sits between the pin and the fold so the
 * engage edge converts the image already on screen (ruling 13). The AUTHORED
 * register comes back beside the DISPLAYED pose — the projection reaches the
 * register on no path (R12b-1), which keeps the produce→pin→project loop dead.
 */

import type { UnknownAction } from '@reduxjs/toolkit';

import type { CameraPose } from '../../../@types/camera/pose/CameraPose';
import type { CameraIntentState } from '../../../@types/camera/orbitCamera/CameraIntentState';
import type { FollowMemory } from '../../../@types/engine/camera/FollowMemory';
import type { FramedCameraPose } from '../../../@types/camera/pose/FramedCameraPose';
import type { CameraArmCtx } from '../../../@types/camera/arms/CameraArmCtx';
import type { TiltMemory } from '../../../@types/camera/orientation/TiltMemory';
import type { Vec3 } from '../../../@types/math/Vec3';

import { applyFocusedBodyPivot } from '../camera/bodyFrame/applyFocusedBodyPivot';
import { hOverR } from '../camera/bodyFrame/hOverR';
import { liveBodyPosition } from '../camera/bodyFrame/liveBodyPosition';
import { approachTiltedPose } from '../camera/arms/world/approachTiltedPose';
import { foldToWorld } from '../camera/arms/foldToWorld';
import { hostOf } from '../camera/arms/hostOf';
import { hostOrThrow } from '../camera/arms/hostOrThrow';
import { isWorldArm } from '../camera/arms/world/isWorldArm';
import { refoldTo } from '../camera/arms/refoldTo';
import { cameraArmKindOf } from '../camera/arms/cameraArmKindOf';
import { sameFrame } from '../camera/arms/sameFrame';
import { stepCameraArm } from '../camera/arms/stepCameraArm';
import { centreLookingArm } from '../../../utils/camera/arms/centreLookingArm';
import { focusInSubtree } from '../../../utils/camera/arms/focusInSubtree';
import { focusBodyIdOf } from '../../../utils/camera/arms/focusBodyIdOf';
import { surfaceFixedChain } from '../../../utils/camera/arms/surfaceFixedChain';
import { notedTiltMemory } from '../../../utils/camera/arms/notedTiltMemory';
import { releasedWorldRoll } from '../../../utils/camera/arms/releasedWorldRoll';
import { eyeMpcOf } from '../../../utils/camera/orbitPose/eyeMpcOf';
import { addVec3 } from '../../../utils/math/addVec3';
import { commitCameraPose } from '../../../state/camera/cameraIntentSlice';
import type { SelectionRowBase } from '../../../@types/engine/selection/SelectionRowBase';

/** The pin's strafe while no follow memory exists. */
const NO_PAN: Vec3 = [0, 0, 0];

export function projectFramePose(args: {
  readonly render: FramedCameraPose;
  readonly authoredOverride: FramedCameraPose | null;
  readonly pivotsOnFocusedBody: boolean;
  readonly focus: SelectionRowBase | null;
  readonly follow: FollowMemory | null;
  readonly tilt: TiltMemory;
  /** The frame's effective camera intent: `base.frame` IS the regime. */
  readonly intent: CameraIntentState;
  /** A held gesture skips the fold. */
  readonly gestureHeld: boolean;
  readonly ctx: CameraArmCtx;
}): {
  readonly register: FramedCameraPose;
  readonly displayed: FramedCameraPose;
  readonly tilt: TiltMemory;
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
    tilt,
    intent,
    gestureHeld,
    ctx,
  } = args;
  const { bodies, poseBasis, upBasis, tuning } = ctx;

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
  // The body the tilt memory belongs to: the ENGAGED arm's host while a body
  // arm holds (a differing focus has already released it), else the SURFACE the
  // focus stands on. Keying a rover's own id would wipe its planet's tilt one
  // frame before `siteCameraArm.host` — whose stated job is to keep it — can run.
  const regime = intent.base.frame;
  const tiltHostId =
    hostOf(regime, ctx)?.id ?? surfaceFixedChain(focusBodyIdOf(ctx.focus)).at(-1) ?? null;
  const noted = notedTiltMemory(tilt, tiltHostId);
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
  const world = foldToWorld(displayed, ctx);

  const actions: UnknownAction[] = [];
  let requestRender = false;
  // The step is asked about the REGIME's pose, never the arm this frame's
  // winner authored: `tween`/`clip` are not arm-gated, so reading the produced
  // pose as the regime swaps §4's disengage test for the engage one
  // mid-animation. Free while the two agree — `refoldTo` answers by reference.
  const target = gestureHeld ? regime : stepCameraArm(refoldTo(displayed, regime, ctx), ctx);
  // One whole skip, never a clamp or a latch, retried next frame: a live gesture
  // (ruled, Q6).
  if (!gestureHeld) {
    // The arm being LEFT, not the arm the winner happened to author in: an
    // approach owed from inside an arm produces a world pose there, and reading
    // `displayed` would skip the normalisation on exactly those crossings.
    if (cameraArmKindOf(target) === 'absolute') {
      if (cameraArmKindOf(regime) !== 'absolute') {
        // Disengage normalization (pop-2 fix) — see `centreLookingArm`. The
        // centre is the FOCUSED body when it merely hangs off the arm's host
        // (a rover keeps its planet's arm, §4.8): the pin and the follow rows
        // re-read an absolute `target` as the focus, so committing the host's
        // centre leaves them a body radius to close as an eye teleport (pop-3).
        // `panOffset` rides along for the same reason — the pin re-reads it
        // too, so a commit without it is a |pan| teleport on the quiet frame.
        const host = hostOrThrow(regime, ctx);
        const focused = focusInSubtree(focusBodyIdOf(ctx.focus), host.id)
          ? liveBodyPosition(focus, bodies)
          : null;
        const centreMpc = addVec3(focused ?? host.state.positionMpc, follow?.panOffset ?? NO_PAN);
        const eyeMpc = eyeMpcOf(world, poseBasis);
        displayed = centreLookingArm(
          eyeMpc,
          centreMpc,
          poseBasis,
          // The world arm's up is the frame pole's: a cut out of the band may
          // not hand it the host's local horizon (see `releasedWorldRoll`).
          releasedWorldRoll(world.roll ?? 0, hOverR(eyeMpc, host.state, host.radiusM), tuning),
        );
        // Centre-looking, so authored and displayed coincide.
        register = displayed;
      }
    } else if (
      !sameFrame(displayed.frame, target) &&
      // The pose being crossed must be the one the step judged — the world arm
      // on an engage, the regime's own arm on a descent between two of them.
      // A produced pose in some THIRD frame (a clip leg's) is not this crossing's.
      (isWorldArm(displayed) || sameFrame(displayed.frame, regime))
    ) {
      displayed = refoldTo(displayed, target, ctx);
      // Engage converts the DISPLAYED pose (ruling 13); below the world arm the
      // tilt is geometry, not a projection, so the register holds it too.
      register = displayed;
    }
    // Once per crossing, and only of a pose in the crossing's TARGET frame:
    // where the refold above declined a third frame, committing anyway would
    // publish that third frame as the regime — a site-framed clip leg over an
    // absolute base jumped two arms in one frame. The wake is the fold's own:
    // `shouldKeepTicking` reads the pre-fold snapshot, so a flip that quiets
    // the last live term would otherwise park the loop.
    if (!sameFrame(target, regime) && sameFrame(displayed.frame, target)) {
      actions.push(commitCameraPose(displayed));
      requestRender = true;
    }
  }

  return { register, displayed, tilt: noted, world, actions, requestRender };
}
