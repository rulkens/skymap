import { describe, expect, it } from 'vitest';

import { APP_COMPOSITION } from '../../src/compositions/app';
import { APP_EXHIBIT_REGISTRY } from '../../src/compositions/appExhibits';
import { FEATURED_TABS } from '../../src/data/palette/featuredTabs';
import { layerSelectionKinds } from '../../src/utils/layer/layerSelectionKinds';

describe('APP_EXHIBIT_REGISTRY', () => {
  // `ExhibitId` lists Layer ids by hand; a listed id with no row only shows up here.
  it('resolves every exhibit the palette features', () => {
    const featured = FEATURED_TABS.flatMap((tab) => tab.cards).flatMap((card) =>
      card.action.kind === 'exhibit' ? [card.action.exhibitId] : [],
    );
    expect(featured.length).toBeGreaterThan(0);
    expect(featured.filter((id) => APP_EXHIBIT_REGISTRY[id] === undefined)).toEqual([]);
  });

  // `picking.off` is plain strings: a typo'd kind turns nothing off and fails nowhere else.
  it("names only composed selection kinds in every exhibit's picking off list", () => {
    const kinds = new Set(layerSelectionKinds(APP_COMPOSITION.layers).map((kind) => kind.type));
    const unknown = Object.values(APP_EXHIBIT_REGISTRY).flatMap((exhibit) =>
      (exhibit.settings?.picking?.off ?? [])
        .filter((type) => !kinds.has(type))
        .map((type) => `${exhibit.id}: '${type}'`),
    );
    expect(unknown).toEqual([]);
  });
});
