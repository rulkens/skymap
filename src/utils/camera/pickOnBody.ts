import type { BodyLocalRay } from '../../@types/camera/BodyLocalRay';
import type { SurfacePick } from '../../@types/camera/SurfacePick';
import type { Vec3 } from '../../@types/math/Vec3';
import { BODY_LOCAL_FRAME } from '../../data/camera/bodyLocalFrame';
import { dot3 } from '../math/dot3';
import { raySphereRoots } from '../math/raySphereRoots';

/** The nearest hit AHEAD of the eye; a hit behind it would grab the far side. */
export function pickOnBody(ray: BodyLocalRay, radiusM: number): SurfacePick | null {
  const roots = raySphereRoots(ray.originM, ray.dir, BODY_LOCAL_FRAME.centreM, radiusM);
  if (roots === null || roots[0] <= 0) return null;
  const t = roots[0];
  const pointM: Vec3 = [
    ray.originM[0] + ray.dir[0] * t,
    ray.originM[1] + ray.dir[1] * t,
    ray.originM[2] + ray.dir[2] * t,
  ];
  return { pointM, incidence: dot3(ray.dir, pointM) / radiusM };
}
