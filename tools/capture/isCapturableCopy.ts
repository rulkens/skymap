import type { PaletteCard } from '../../src/@types/palette/PaletteCard';

/** A card copy the capture tool can shoot: it flies somewhere, and no `image` overrides the atlas. */
export function isCapturableCopy(card: PaletteCard): boolean {
  return card.action.kind === 'focus' && card.image === undefined;
}
