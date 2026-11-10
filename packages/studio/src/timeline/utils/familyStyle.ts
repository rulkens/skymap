/** Sets `--c`, the channel hue the dock's `--ch-<family>` tokens define, so a row's icon and mark share one tint. */
import type { CSSProperties } from 'react';
import type { ChannelFamily } from '../../@types/rows/ChannelFamily';

export function familyStyle(family: ChannelFamily | null): CSSProperties {
  return family === null ? {} : ({ '--c': `var(--ch-${family})` } as CSSProperties);
}
