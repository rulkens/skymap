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

import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { CameraState } from '../../../@types/camera/CameraState';
import type { FollowMemory } from '../../../@types/engine/camera/FollowMemory';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { RungCtx } from '../../../@types/camera/RungCtx';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { TiltMemory } from '../../../@types/camera/TiltMemory';
import type { Vec3 } from '../../../@types/math/Vec3';

import { applyFocusedBodyPivot } from '../camera/applyFocusedBodyPivot';
import { approachTiltedPose } from '../camera/approachTiltedPose';
import { foldToWorld } from '../camera/rungs/foldToWorld';
import { frameBodyId } from '../camera/rungs/frameBodyId';
import { hostOf } from '../camera/rungs/hostOf';
import { hostOrThrow } from '../camera/rungs/hostOrThrow';
import { isWorldArm } from '../camera/rungs/isWorldArm';
import { refoldTo } from '../camera/rungs/refoldTo';
import { rungKindOf } from '../camera/rungs/rungKindOf';
import { sameFrame } from '../camera/rungs/sameFrame';
import { stepRung } from '../camera/rungs/stepRung';
import { centreLookingArm } from '../../../utils/camera/centreLookingArm';
import { focusInSubtree } from '../../../utils/camera/focusInSubtree';
import { notedTiltMemory } from '../../../utils/camera/notedTiltMemory';
import { eyeMpcOf } from '../../../utils/camera/eyeMpcOf';
import { addVec3 } from '../../../utils/math/addVec3';
import { commitCameraPose } from '../../../state/camera/cameraSlice';

/** The pin's strafe while no follow memory exists. */
const NO_PAN: Vec3 = [0, 0, 0];

export function projectFramePose(args: {
  readonly render: FramedCameraPose;
  readonly authoredOverride: FramedCameraPose | null;
  readonly pivotsOnFocusedBody: boolean;
  readonly focus: SelectionRow | null;
  readonly follow: FollowMemory | null;
  /** A follow approach is in flight and has not saturated — the §4.8 gate's half. */
  readonly approaching: boolean;
  readonly tilt: TiltMemory;
  /** The frame's effective camera intent: `base.frame` IS the regime, `dragging` skips the fold. */
  readonly intent: CameraState;
  readonly ctx: RungCtx;
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
    approaching,
    tilt,
    intent,
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
  // The body the tilt memory belongs to: the ENGAGED rung's host while a body
  // arm holds (a differing focus has already released it), else the FOCUSED body.
  const regime = intent.base.frame;
  const noted = notedTiltMemory(tilt, hostOf(regime, ctx)?.id ?? ctx.focusBodyId);
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
  const target = intent.dragging ? regime : stepRung(refoldTo(displayed, regime, ctx), ctx);
  // Two whole skips, never a clamp or a latch, both retried next frame: a live
  // gesture (ruled, Q6), and an approach that has not reached its FOCUS (§4.8).
  // `followActive` is gated on the world arm, so descending into a rung the
  // focus merely hangs off — Mars, under a rover focus — goes inactive
  // mid-flight and parks the camera ~1500 km short. A descent into the focus's
  // OWN rung is the arrival and must still land, or the ease yanks a camera
  // already inside its focus's band out to framing distance and it never
  // engages again.
  if (!intent.dragging && !(approaching && frameBodyId(target) !== ctx.focusBodyId)) {
    if (rungKindOf(target) === 'absolute') {
      if (!isWorldArm(displayed)) {
        // Disengage normalization (pop-2 fix) — see `centreLookingArm`. The
        // centre is the FOCUSED body when it merely hangs off the arm's host
        // (a rover keeps its planet's arm, §4.8): the pin and the follow rows
        // re-read an absolute `target` as the focus, so committing the host's
        // centre leaves them a body radius to close as an eye teleport (pop-3).
        // `panOffset` rides along for the same reason — the pin re-reads it
        // too, so a commit without it is a |pan| teleport on the quiet frame.
        const host = hostOrThrow(displayed.frame, ctx);
        const focused =
          ctx.focusBodyId !== null && focusInSubtree(ctx.focusBodyId, host.id)
            ? bodies.get(ctx.focusBodyId)
            : undefined;
        const centreMpc = addVec3((focused ?? host.state).positionMpc, follow?.panOffset ?? NO_PAN);
        displayed = centreLookingArm(
          eyeMpcOf(world, poseBasis),
          centreMpc,
          poseBasis,
          world.roll ?? 0,
        );
        // Centre-looking, so authored and displayed coincide.
        register = displayed;
      }
    } else if (
      !sameFrame(displayed.frame, target) &&
      // The pose being crossed must be the one the step judged — the world arm
      // on an engage, the regime's own rung on a descent between two of them.
      // A produced pose in some THIRD frame (a clip leg's) is not this crossing's.
      (isWorldArm(displayed) || sameFrame(displayed.frame, regime))
    ) {
      displayed = refoldTo(displayed, target, ctx);
      // Engage converts the DISPLAYED pose (ruling 13); below the world arm the
      // tilt is geometry, not a projection, so the register holds it too.
      register = displayed;
    }
    // Once per crossing. The wake is the fold's own: `shouldKeepTicking` reads
    // the pre-fold snapshot, so a flip that quiets the last live term would
    // otherwise park the loop.
    if (!sameFrame(target, regime)) {
      actions.push(commitCameraPose(displayed));
      requestRender = true;
    }
  }

  return { register, displayed, tilt: noted, world, actions, requestRender };
}
