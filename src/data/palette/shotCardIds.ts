/**
 * SHOT_CARD_IDS — focus ids with a captured card thumbnail under
 * `CARD_IMAGE_DIR`. Mirrors `capture-featured`'s own capturable rule (see
 * tools/capture/README.md's skip rules) rather than reading the directory, so
 * the set stays correct for a card not yet captured.
 */
import { FEATURED_TABS } from './featuredTabs';

const ids = new Set<string>();
for (const tab of FEATURED_TABS) {
  for (const card of tab.cards) {
    if (card.action.kind === 'focus' && card.image === undefined) {
      ids.add(card.action.focusId);
    }
  }
}

export const SHOT_CARD_IDS: ReadonlySet<string> = ids;
