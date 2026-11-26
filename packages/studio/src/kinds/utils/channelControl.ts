/** The inspector control for a channel's scalar: Mpc for distance, a plain number for look-at, else degrees. */
import type { Channel } from '../../../../../src/@types/animation/Channel';
import type { FieldControl } from '../../@types/kinds/FieldControl';

export function channelControl(ch: Channel): FieldControl {
  return ch === 'distance' ? 'mpc' : ch === 'target' ? 'number' : 'degrees';
}
