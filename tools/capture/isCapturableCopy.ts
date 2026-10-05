import type { PaletteCard } from '../../src/@types/palette/PaletteCard';

/** A card copy the capture tool can shoot: no `image` overrides the atlas. */
export function isCapturableCopy(card: PaletteCard): boolean {
  return card.image === undefined;
}
