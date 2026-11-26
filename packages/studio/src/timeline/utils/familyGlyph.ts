/** The legend icon of a channel family: what a kind without its own glyph shows. */
import { CHANNEL_FAMILY_LEGEND } from '../../data/channelFamilies';
import type { GlyphId } from '../../@types/kinds/GlyphId';
import type { ChannelFamily } from '../../@types/rows/ChannelFamily';

export function familyGlyph(family: ChannelFamily | null): GlyphId {
  return CHANNEL_FAMILY_LEGEND.find((entry) => entry.family === family)?.glyph ?? 'dist';
}
