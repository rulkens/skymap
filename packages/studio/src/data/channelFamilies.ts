/** Channel to family (the icon tint and the lane column a row writes), and the legend in display order. */
import type { Channel } from '../../../../src/@types/animation/Channel';
import type { GlyphId } from '../@types/kinds/GlyphId';
import type { ChannelFamily } from '../@types/rows/ChannelFamily';

export const CHANNEL_FAMILY: Record<Channel, ChannelFamily> = {
  distance: 'distance',
  fov: 'distance',
  target: 'lookAt',
  yaw: 'turn',
  pitch: 'turn',
  roll: 'turn',
};

export const CHANNEL_FAMILY_LEGEND: readonly {
  readonly family: ChannelFamily;
  readonly name: string;
  readonly glyph: GlyphId;
}[] = [
  { family: 'distance', name: 'Distance', glyph: 'dist' },
  { family: 'lookAt', name: 'Look-at', glyph: 'look' },
  { family: 'turn', name: 'Turn · tilt', glyph: 'turn' },
  { family: 'layers', name: 'Layers', glyph: 'layers' },
  { family: 'settings', name: 'Settings · focus', glyph: 'settings' },
];
