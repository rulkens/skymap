/** One run of a block's direct children, as its folded row shows it: the icon, tinted, `×count` past one. */
import type { GlyphId } from '../kinds/GlyphId';
import type { ChannelFamily } from './ChannelFamily';

export type RowMember = {
  readonly glyph: GlyphId;
  readonly family: ChannelFamily | null;
  /** The child's Name, for the strip's accessible name. */
  readonly name: string;
  readonly count: number;
};
