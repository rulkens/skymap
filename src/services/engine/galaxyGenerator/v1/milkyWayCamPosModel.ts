/**
 * milkyWayCamPosModel — the eye, expressed in the Milky Way cloud's model
 * space, which is where the sprite shader builds its per-instance eye-facing
 * basis (`milkyWay/sprites/io.wesl`). The placement never changes, so its
 * inverse is memoised alongside `milkyWayModelCached`'s forward matrix.
 */
import { mat4, vec3 } from 'wgpu-matrix';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { milkyWayModelCached } from './milkyWayModelCached';

let cachedInverse: Float32Array | null = null;

export function milkyWayCamPosModel(camPosWorld: Readonly<Vec3>): Vec3 {
  cachedInverse ??= mat4.inverse(milkyWayModelCached()) as Float32Array;
  // A POINT, not a direction: `transformMat4` divides through by w, so the
  // model's translation and scale both apply. Nothing to renormalise.
  const p = vec3.transformMat4([camPosWorld[0], camPosWorld[1], camPosWorld[2]], cachedInverse);
  return [p[0]!, p[1]!, p[2]!];
}
