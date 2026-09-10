import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { Vec3 } from '../../@types/math/Vec3';
import { canonicalBasisAt } from './canonicalBasisAt';
import { cappedRotationToward } from './cappedRotationToward';
import { eyeFrameOf } from './eyeFrameOf';
import { turnedPose } from './turnedPose';

/**
 * The one level settle: rotate the basis toward the roll-free pose at its own
 * standpoint and tilt, capped — FULL below the cap, which is what makes
 * gesture-created roll unrepresentable rather than merely damped (R1: no
 * gesture may introduce roll), while an arriving roll eases out over a few
 * inputs. Drags level in the pure body ENU (`blendW` 1) and hold the heading
 * they entered with (`heldAzimuthRad` — a curved pan cannot rotate the
 * image); zoom notches level in the band-blended frame at the pose's own
 * azimuth, about the dive anchor or the eye. The caller prices `capRad` in its
 * own currency (`ORIENT_DECAY`): a notch per log-zoom spent, a drag per step.
 */
export function levelledPose(
  pose: BodyFixedPose,
  args: {
    readonly blendW: number;
    readonly sceneUpLocal: Readonly<Vec3>;
    readonly heldAzimuthRad: number | null;
    readonly pivotM: Readonly<Vec3> | null;
    readonly capRad: number;
  },
): BodyFixedPose {
  // A zero cap must return BY REFERENCE, which it does not deliver by itself:
  // `cappedRotationToward` still returns a quat wherever the bases differ, and
  // `turnedPose`'s eye − pivot … + pivot round trip re-adds float noise.
  if (args.capRad === 0) return pose;
  const frame = eyeFrameOf(pose, args.blendW, args.sceneUpLocal);
  if (frame === null) return pose;
  const target = canonicalBasisAt(frame, args.heldAzimuthRad ?? frame.azimuthRad, frame.tiltRad);
  const q = cappedRotationToward(pose.basisLocal, target, args.capRad);
  if (q === null) return pose;
  return turnedPose(pose, q, args.pivotM);
}
