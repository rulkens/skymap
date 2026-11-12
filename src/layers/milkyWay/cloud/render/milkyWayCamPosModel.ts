/**
 * milkyWayCamPosModel — the eye, expressed in the Milky Way cloud's model
 * space, which is where the sprite shader builds its per-instance eye-facing
 * basis (`milkyWay/sprites/io.wesl`).
 */
import { vec3 } from 'wgpu-matrix';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { milkyWayInverseModelCached } from './milkyWayInverseModelCached';

export function milkyWayCamPosModel(camPosWorld: Readonly<Vec3>): Vec3 {
  // A POINT, not a direction: `transformMat4` divides through by w, so the
  // model's translation and scale both apply. Nothing to renormalise.
  const p = vec3.transformMat4(
    [camPosWorld[0], camPosWorld[1], camPosWorld[2]],
    milkyWayInverseModelCached(),
  );
  return [p[0]!, p[1]!, p[2]!];
}
