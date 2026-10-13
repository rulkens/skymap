/**
 * Home's own deep links, parsed by the app's parser like the places are: a
 * renamed tour, clip or palette id fails here, not in a visitor's browser.
 */
import { describe, expect, it } from 'vitest';

import { appLink } from '../../../packages/website/src/data/appLink';
import { HOME_LINKS } from '../../../packages/website/src/data/homeLinks';
import { linkIntentFrom } from '../../../src/utils/url/linkIntentFrom';
import { tourRegistry } from '../../../src/data/animation/tours/tourRegistry';
import { clipFactories } from '../../../src/data/animation/clips/clipRegistry';
import { FEATURED_TABS } from '../../../src/data/palette/featuredTabs';

describe('Home deep links', () => {
  it('the tour link starts a registered tour', () => {
    const { view } = linkIntentFrom(HOME_LINKS.tour);
    expect(view.kind).toBe('tour');
    expect(Object.keys(tourRegistry)).toContain(view.kind === 'tour' ? view.id : '');
    expect(appLink(HOME_LINKS.tour)).toBe('/#tour=grandTour');
  });

  it('the park link plays a registered clip', () => {
    const { view } = linkIntentFrom(HOME_LINKS.parkFlight);
    expect(view.kind).toBe('clip');
    expect(Object.keys(clipFactories)).toContain(view.kind === 'clip' ? view.id : '');
  });

  it('the classroom example names a palette object and a UTC instant', () => {
    const { view, t } = linkIntentFrom(HOME_LINKS.classroom);
    const focusIds = FEATURED_TABS.flatMap((tab) => tab.cards).flatMap((card) =>
      card.action.kind === 'focus' ? [card.action.focusId] : [],
    );
    expect(view.kind).toBe('focus');
    expect(focusIds).toContain(view.kind === 'focus' ? view.id : '');
    expect(t).toBe(Date.UTC(2033, 2, 14, 21, 0, 0));
  });
});
