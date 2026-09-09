import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { Vec3 } from '../../@types/math/Vec3';
import type { Vec4 } from '../../@types/math/Vec4';
import { poseWithBasisTurn } from './poseWithBasisTurn';
import { rotatedAboutPoint } from './rotatedAboutPoint';

/**
 * A settle rotation with its pivot as data: about a body-fixed point (the
 * whole pose turns — a dive's anchor, the body centre) or, with `null`, about
 * the eye (basis only — enforcement and recessions never move the eye, T17).
 */
export function turnedPose(
  pose: BodyFixedPose,
  q: Readonly<Vec4>,
  pivotM: Readonly<Vec3> | null,
): BodyFixedPose {
  return pivotM === null ? poseWithBasisTurn(pose, q) : rotatedAboutPoint(pose, q, pivotM);
}
