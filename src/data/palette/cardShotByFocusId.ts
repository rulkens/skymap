/**
 * CARD_SHOT_BY_FOCUS_ID — for each focus id a featured card names, the card id
 * its captured thumbnail is filed under in `CARD_IMAGE_DIR`. The two differ
 * wherever a card's subject is not a body (`body-sirius` names `star-sirius`),
 * so a search row cannot find the shot by focus id alone. Mirrors
 * `capture-featured`'s own capturable rule (see tools/capture/README.md's skip
 * rules) rather than reading the directory, so the map stays correct for a card
 * not yet captured.
 */
import { FEATURED_TABS } from './featuredTabs';

const byFocusId = new Map<string, string>();
for (const tab of FEATURED_TABS) {
  for (const card of tab.cards) {
    if (card.action.kind === 'focus' && card.image === undefined) {
      byFocusId.set(card.action.focusId, card.id);
    }
  }
}

export const CARD_SHOT_BY_FOCUS_ID: ReadonlyMap<string, string> = byFocusId;
