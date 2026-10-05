/**
 * Every "place to start" must open something the app really knows. The hash is
 * parsed by the app's own parser; the focus id it yields is then looked up in
 * the app's registries. Stopped short of a GPU/store boot: ids with the
 * `star-` prefix are checked against the famous-star table, the
 * rest (bodies, galaxies, structures, black holes) only against the palette's own
 * focus cards, which is the list the app dispatches `requestFocus` from.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PLACES } from '../../../packages/website/src/data/places';
import { fact } from '../../../packages/website/src/data/fact';
import { appLink, APP_BASE } from '../../../packages/website/src/data/appLink';
import { linkIntentFrom } from '../../../src/utils/url/linkIntentFrom';
import { FEATURED_TABS } from '../../../src/data/palette/featuredTabs';
import { FAMOUS_STARS_GENERATED } from '../../../src/data/bodies/famousStars.generated';

const paletteFocusIds = new Set(
  FEATURED_TABS.flatMap((tab) => tab.cards).flatMap((card) =>
    card.action.kind === 'focus' ? [card.action.focusId] : [],
  ),
);
const starIds = new Set(FAMOUS_STARS_GENERATED.map((s) => `star-${s.id}`));

describe('place ids and links', () => {
  it('ids are unique', () => {
    const ids = PLACES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('appLink returns the app base alone, or with the hash after a #', () => {
    expect(appLink()).toBe(APP_BASE);
    expect(appLink('focus=body-earth')).toMatch(/#focus=body-earth$/);
  });
});

describe.each(PLACES)('place $id', (place) => {
  const view = linkIntentFrom(place.hash).view;

  it('the app parses its hash as a focus request', () => {
    expect(view.kind).toBe('focus');
  });

  it('the focus id names an object the app knows', () => {
    const id = view.kind === 'focus' ? view.id : '';
    expect(paletteFocusIds.has(id), `${id} is not a palette focus card`).toBe(true);
    if (id.startsWith('star-')) expect(starIds.has(id), `${id} not in famous stars`).toBe(true);
  });

  it('its image exists in the shared featured set and its fact row exists', () => {
    expect(place.image).toMatch(/^\/images\/featured\/[^/]+\.webp$/);
    expect(
      existsSync(resolve(import.meta.dirname, '../../../public', place.image.slice(1))),
      place.image,
    ).toBe(true);
    if (place.factId) expect(() => fact(place.factId!)).not.toThrow();
  });
});
