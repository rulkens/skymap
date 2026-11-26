/** Sets `--c` to the family's tint token, so a row's icon and mark share one hue. */
import { CHANNEL_FAMILY_TINT } from '../../data/channelFamilies';
import type { CSSProperties } from 'react';
import type { ChannelFamily } from '../../@types/rows/ChannelFamily';

export function familyStyle(family: ChannelFamily | null): CSSProperties {
  return family === null ? {} : ({ '--c': CHANNEL_FAMILY_TINT[family] } as CSSProperties);
}
