import type { GlyphId } from '../../../@types/kinds/GlyphId';
import { GLYPH_ICONS } from '../../data/glyphIcons';

type Props = { readonly id: GlyphId; readonly size?: number };

function Glyph({ id, size = 16 }: Props) {
  const Icon = GLYPH_ICONS[id];
  return <Icon size={size} />;
}

export default Glyph;
