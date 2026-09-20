import { CARD_IMAGE_DIR } from '../../../data/palette/cardImageDir';
import type { PaletteCard } from '../../../@types/palette/PaletteCard';

/** A card's image: its explicit override, or the default atlas path by id. */
export function cardImageSrc(card: PaletteCard): string {
  return card.image ?? `${CARD_IMAGE_DIR}/${card.id}.webp`;
}
