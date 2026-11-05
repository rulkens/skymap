/**
 * A card shot's URL for a given focus id. Single home of the naming
 * convention shared with tools/capture, so the browser side and the
 * capture tool can never drift apart on where a shot lives.
 */
import { CARD_IMAGE_DIR } from '../../data/palette/cardImageDir';

export function cardShotUrl(focusId: string): string {
  return `${CARD_IMAGE_DIR}/${focusId}.webp`;
}
