import { cardShotUrl } from '../../../utils/palette/cardShotUrl';
import type { PaletteCard } from '../../../@types/palette/PaletteCard';

/** A card's image: its explicit override, or the default atlas path by id. */
export function cardImageSrc(card: PaletteCard): string {
  return card.image ?? cardShotUrl(card.id);
}
