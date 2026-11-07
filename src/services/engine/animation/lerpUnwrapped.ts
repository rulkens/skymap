/**
 * lerpUnwrapped — `lerpChannel` without the shortest arc: angles mix as plain
 * numbers, so two plans more than π apart (a full-turn spin, a tween run on from
 * an unwrapped end) blend along their own turn instead of flipping mid-window.
 * Distance and fov stay log, target component-wise.
 */
import type { Channel } from '../../../@types/animation/Channel';
import type { Vec3 } from '../../../@types/math/Vec3';
import { CHANNEL_SPACE, lerpInSpace } from './channelSpace';
import { lerpChannel } from './lerpChannel';

export function lerpUnwrapped<V extends number | Vec3>(channel: Channel, a: V, b: V, w: number): V {
  if (channel === 'target') return lerpChannel(channel, 'lin', a, b, w);
  return lerpInSpace(CHANNEL_SPACE[channel], a as number, b as number, w) as V;
}
