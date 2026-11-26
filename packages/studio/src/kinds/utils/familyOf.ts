/** The one family a single-channel kind writes, as its `writes` list. */
import { CHANNEL_FAMILY } from '../../data/channelFamilies';
import type { Channel } from '../../../../../src/@types/animation/Channel';
import type { ChannelFamily } from '../../@types/rows/ChannelFamily';

export function familyOf(ch: Channel): readonly ChannelFamily[] {
  return [CHANNEL_FAMILY[ch]];
}
