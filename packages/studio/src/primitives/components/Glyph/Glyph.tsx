import type { GlyphId } from '../../../@types/kinds/GlyphId';
import { GLYPH_ICONS } from '../../data/glyphIcons';

type GlyphProps = { readonly id: GlyphId; readonly size?: number };

function Glyph({ id, size = 16 }: GlyphProps) {
  const Icon = GLYPH_ICONS[id];
  return <Icon size={size} />;
}

export default Glyph;
