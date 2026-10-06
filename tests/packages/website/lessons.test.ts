/**
 * The classroom page's lesson links, parsed by the app's own parser: a renamed
 * exhibit or object id fails here, not in front of a class.
 */
import { describe, expect, it } from 'vitest';

import { fact } from '../../../packages/website/src/data/fact';
import { LESSON_TOPICS } from '../../../packages/website/src/data/lessons';
import { exhibitRegistry } from '../../../src/data/exhibits/exhibitRegistry';
import { FEATURED_TABS } from '../../../src/data/palette/featuredTabs';
import { linkIntentFrom } from '../../../src/utils/url/linkIntentFrom';

const lessons = LESSON_TOPICS.flatMap((topic) => topic.lessons);
const paletteFocusIds = new Set(
  FEATURED_TABS.flatMap((tab) => tab.cards).flatMap((card) =>
    card.action.kind === 'focus' ? [card.action.focusId] : [],
  ),
);

describe('lesson links', () => {
  it('ids are unique across topics', () => {
    const ids = lessons.map((lesson) => lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe.each(lessons)('lesson $id', (lesson) => {
  it('opens an exhibit or an object the app knows', () => {
    const { view } = linkIntentFrom(lesson.hash);
    if (view.kind === 'exhibit') expect(Object.keys(exhibitRegistry)).toContain(view.id);
    else {
      expect(view.kind).toBe('focus');
      expect(paletteFocusIds.has(view.kind === 'focus' ? view.id : '')).toBe(true);
    }
  });

  it('cites a fact row that exists', () => {
    if (lesson.factId) expect(() => fact(lesson.factId!)).not.toThrow();
  });
});
