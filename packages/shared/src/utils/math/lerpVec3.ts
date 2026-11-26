/**
 * lerpVec3 — component-wise `lerp` across a Vec3. No clamping of its own
 * (same reasoning as `lerp`): callers that want a bounded blend clamp `t`
 * themselves.
 */
import { lerp } from './lerp';
import type { Vec3 } from '../../@types/math/Vec3';

export function lerpVec3(a: Readonly<Vec3>, b: Readonly<Vec3>, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
