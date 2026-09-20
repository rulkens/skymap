import type { PaletteCard } from '../../../@types/palette/PaletteCard';

/** A card's image: its explicit override, or the default atlas path by id. */
export function cardImageSrc(card: PaletteCard): string {
  return card.image ?? `/images/featured/${card.id}.webp`;
}
