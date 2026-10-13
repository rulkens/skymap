/**
 * The classroom page's lesson links, parsed by the app's own parser: a renamed
 * exhibit or object id fails here, not in front of a class.
 */
import { describe, expect, it } from 'vitest';

import { LESSON_TOPICS } from '../../../packages/website/src/data/lessons';
import { APP_EXHIBITS } from '../../../src/compositions/appExhibits';
import { FEATURED_TABS } from '../../../src/data/palette/featuredTabs';
import { linkIntentFrom } from '../../../src/utils/url/linkIntentFrom';

const lessons = LESSON_TOPICS.flatMap((topic) => topic.lessons);
const paletteFocusIds = new Set(
  FEATURED_TABS.flatMap((tab) => tab.cards).flatMap((card) =>
    card.action.kind === 'focus' ? [card.action.focusId] : [],
  ),
);

describe.each(lessons)('lesson $shot', (lesson) => {
  it('opens an exhibit or an object the app knows', () => {
    const { view } = linkIntentFrom(lesson.hash);
    if (view.kind === 'exhibit') expect(Object.keys(APP_EXHIBITS)).toContain(view.id);
    else {
      expect(view.kind).toBe('focus');
      expect(paletteFocusIds.has(view.kind === 'focus' ? view.id : '')).toBe(true);
    }
  });
});
