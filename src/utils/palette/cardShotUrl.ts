/**
 * A card shot's URL for a given card id (the capture
 * tool's file stem, which differs from the focus id for renamed cards). Single home of the naming
 * convention shared with tools/capture, so the browser side and the
 * capture tool can never drift apart on where a shot lives.
 */
import { CARD_IMAGE_DIR } from '../../data/palette/cardImageDir';

export function cardShotUrl(cardId: string): string {
  return `${CARD_IMAGE_DIR}/${cardId}.webp`;
}
