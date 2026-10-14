import { describe, expect, it } from 'vitest';

import { APP_EXHIBITS } from '../../src/compositions/appExhibits';
import { FEATURED_TABS } from '../../src/data/palette/featuredTabs';

describe('APP_EXHIBITS', () => {
  // `ExhibitId` lists Layer ids by hand; a listed id with no row only shows up here.
  it('resolves every exhibit the palette features', () => {
    const featured = FEATURED_TABS.flatMap((tab) => tab.cards).flatMap((card) =>
      card.action.kind === 'exhibit' ? [card.action.exhibitId] : [],
    );
    expect(featured.length).toBeGreaterThan(0);
    expect(featured.filter((id) => APP_EXHIBITS[id] === undefined)).toEqual([]);
  });
});
