/**
 * lerpChannel — the one home of how a channel interpolates between two values.
 * Yaw and roll take the shortest arc, so a large accumulated yaw from prior
 * dragging never unwinds whole revolutions. `target` is a signed world position:
 * log and angle spaces mean nothing for it, so it is component-wise linear and
 * `space` is ignored.
 */

import type { Channel } from '../../../@types/animation/Channel';
import type { Space } from '../../../@types/animation/Space';
import type { Vec3 } from '../../../@types/math/Vec3';
import { lerpInSpace } from './channelSpace';
import { lerpAngleShortest } from '../../../utils/math/lerpAngleShortest';
import { lerpVec3 } from '../../../utils/math/lerpVec3';

export function lerpChannel<V extends number | Vec3>(
  channel: Channel,
  space: Space,
  a: V,
  b: V,
  w: number,
): V {
  if (channel === 'yaw' || channel === 'roll') {
    return lerpAngleShortest(a as number, b as number, w) as V;
  }
  if (channel === 'target') {
    return lerpVec3(a as Vec3, b as Vec3, w) as V;
  }
  return lerpInSpace(space, a as number, b as number, w) as V;
}
