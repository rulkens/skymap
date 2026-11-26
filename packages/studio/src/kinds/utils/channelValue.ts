/** A channel's scalar in the unit people read it in: Mpc for distance, degrees for angles. */
import { formatDegrees } from './formatDegrees';
import { formatMpc } from '../../utils/format/formatMpc';
import type { Channel } from '../../../../../src/@types/animation/Channel';

export function channelValue(ch: Channel, value: number): string {
  return ch === 'distance' ? formatMpc(value) : formatDegrees(value);
}
