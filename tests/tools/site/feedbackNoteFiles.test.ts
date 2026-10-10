import { describe, expect, it } from 'vitest';

import type { FeedbackNote } from '../../../tools/site/@types/FeedbackNote';
import { feedbackIndexLine } from '../../../tools/site/utils/feedbackIndexLine';
import { feedbackNoteStem } from '../../../tools/site/utils/feedbackNoteStem';
import { isFeedbackNote } from '../../../tools/site/utils/isFeedbackNote';

describe('feedbackNoteStem', () => {
  it('has no colons or milliseconds and names the page', () => {
    expect(feedbackNoteStem('2026-10-06T14:03:22.123Z', '/home/classroom/', 2)).toBe(
      '2026-10-06T14-03-22Z-home-classroom-2',
    );
  });

  it('falls back to "index" for a path with no letters', () => {
    expect(feedbackNoteStem('2026-10-06T14:03:22.000Z', '/', 1)).toBe(
      '2026-10-06T14-03-22Z-index-1',
    );
  });
});

describe('feedbackIndexLine', () => {
  const note = {
    text: 'Too dark\nsecond line',
    timestamp: '2026-10-06T14:03:22.123Z',
    page: { path: '/home/' },
    element: {
      selector: 'section.hero > h1',
      source: {
        file: 'packages/website/src/components/Flight.astro',
        loc: '65:9',
        inherited: true,
      },
    },
  } as FeedbackNote;

  it('is one line: time, page, selector, source, first line of the note, file', () => {
    const line = feedbackIndexLine(note, 'stem');
    expect(line).not.toContain('\n');
    expect(line).toBe(
      '- 2026-10-06 14:03:22Z · /home/ · `section.hero > h1` · packages/website/src/components/Flight.astro:65:9 (ancestor) · Too dark · stem.json',
    );
  });

  // The timestamp becomes part of a file name, so a path in it would write outside the notes folder.
  it('is a note only with an ISO instant for its time', () => {
    expect(isFeedbackNote(note)).toBe(true);
    expect(isFeedbackNote({ ...note, timestamp: '../../../../tmp/x' })).toBe(false);
    expect(isFeedbackNote({ ...note, timestamp: '2026-10-06T14:03:22Z/../x' })).toBe(false);
  });

  it('says so when the dev build gave no source', () => {
    const bare = { ...note, element: { ...note.element, source: null } } as FeedbackNote;
    expect(feedbackIndexLine(bare, 's')).toContain('no source');
  });
});
