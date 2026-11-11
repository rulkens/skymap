/**
 * deriveFieldView — one frame view's camera, carried into the galaxy frame.
 * The world basis is rebuilt as `computeViewProj` builds its view matrix
 * (decoded forward, roll about the frame pole), then `toGalaxy` maps the eye
 * as a point and each axis as a direction. A placement is a rotation plus a
 * uniform scale, so renormalising the axes undoes the scale and the frustum's
 * angles pass through untouched. `vec3n` keeps the maths in f64 over the f32
 * matrix: the eye can sit far from the galaxy.
 */
import { vec3n, type Mat4 } from 'wgpu-matrix';
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { FieldView } from '../@types/FieldView';
import { frameUp } from '../../../../utils/camera/orbitPose/frameUp';
import { imagePlaneBasis } from '../../../../utils/camera/orbitPose/imagePlaneBasis';
import { orbitForwardOf } from '../../../../utils/camera/orbitPose/orbitForwardOf';

export function deriveFieldView(frame: FrameView, toGalaxy: Mat4): FieldView {
  const { cam } = frame;
  const fwd = orbitForwardOf(cam);
  const basis = imagePlaneBasis(fwd, cam.roll ?? 0, frameUp(cam.upBasis));
  const direction = (v: Readonly<Vec3>): Vec3 => {
    const d = vec3n.normalize(vec3n.transformMat4Upper3x3(v, toGalaxy));
    return [d[0]!, d[1]!, d[2]!];
  };
  const eye = vec3n.transformMat4(frame.drawCamPos, toGalaxy);
  return {
    eye: [eye[0]!, eye[1]!, eye[2]!],
    right: direction(basis.right),
    up: direction(basis.up),
    fwd: direction(fwd),
    frustum: frame.frustum,
  };
}
