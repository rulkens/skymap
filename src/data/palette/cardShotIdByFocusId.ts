/**
 * CARD_SHOT_ID_BY_FOCUS_ID — focus id → the card id its captured thumbnail is
 * stored under in `CARD_IMAGE_DIR`. They differ for renamed cards (e.g. focus
 * `galaxy-cluster-virgo-m87`, file `cluster-virgo-m87.webp`). Mirrors
 * `capture-featured`'s own capturable rule (tools/capture/README.md skip
 * rules) rather than reading the directory, so it stays correct for a card
 * not yet captured.
 */
import { FEATURED_TABS } from './featuredTabs';

const cardIds = new Map<string, string>();
for (const tab of FEATURED_TABS) {
  for (const card of tab.cards) {
    if (card.action.kind === 'focus' && card.image === undefined) {
      cardIds.set(card.action.focusId, card.id);
    }
  }
}

export const CARD_SHOT_ID_BY_FOCUS_ID: ReadonlyMap<string, string> = cardIds;
