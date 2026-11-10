/** A channel's scalar in the unit people read it in: Mpc for distance, degrees for angles. */
import { formatDegrees } from './formatDegrees';
import { formatQuantity } from '../../utils/format/formatQuantity';
import type { Channel } from '../../../../../src/@types/animation/Channel';

export function channelValue(ch: Channel, value: number): string {
  return ch === 'distance' ? formatQuantity(value, 'Mpc') : formatDegrees(value);
}
