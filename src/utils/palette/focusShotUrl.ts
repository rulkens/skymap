/**
 * The captured card shot for a focus id, or undefined when no featured card
 * focuses it. Shots are filed by card id, which differs from the focus id for
 * structures (card `cluster-virgo-m87`, focus `galaxy-cluster-virgo-m87`), so
 * the lookup goes through the featured cards and never builds a path from the
 * focus id. Cards with their own `image` are skipped: that image is not a shot.
 */
import { FEATURED_TABS } from '../../data/palette/featuredTabs';
import { cardShotUrl } from './cardShotUrl';

const urls = new Map<string, string>();
for (const tab of FEATURED_TABS) {
  for (const card of tab.cards) {
    if (card.action.kind === 'focus' && card.image === undefined) {
      urls.set(card.action.focusId, cardShotUrl(card.id));
    }
  }
}

export function focusShotUrl(focusId: string): string | undefined {
  return urls.get(focusId);
}
