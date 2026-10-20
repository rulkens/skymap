import { describe, expect, it } from 'vitest';

import type { DocsReviewMark } from '../../../tools/site/@types/DocsReviewMark';
import { ownerMark } from '../../../packages/website/src/dev/review/ownerMark';
import { setNote } from '../../../packages/website/src/dev/review/setNote';

const mark: DocsReviewMark = { id: 'a', text: 'the passage', reason: 'owner', state: 'rewrite' };

describe('setNote', () => {
  it('returns a new mark with the note, leaving the one it was given alone', () => {
    const next = setNote(mark, 'how', 'shorter');
    expect(next).toEqual({ ...mark, how: 'shorter' });
    expect(mark).not.toHaveProperty('how');
  });

  it('takes an empty note, or a replacement equal to the passage, off the mark', () => {
    const noted = { ...mark, why: 'long', after: 'new words' };
    expect(setNote(noted, 'why', '')).not.toHaveProperty('why');
    expect(setNote(noted, 'after', 'the passage')).not.toHaveProperty('after');
    expect(setNote(noted, 'after', 'newer words').after).toBe('newer words');
  });
});

describe('ownerMark', () => {
  it('numbers the owner marks after the highest one in the file, whoever drew the others', () => {
    const marks = [
      { ...mark, id: 'cutter-9' },
      { ...mark, id: 'owner-3' },
      { ...mark, id: 'owner-1' },
    ];
    expect(ownerMark(marks, 'words', 'cut')).toEqual({
      id: 'owner-4',
      text: 'words',
      reason: 'owner',
      state: 'cut',
    });
    expect(ownerMark([], 'words', 'good').id).toBe('owner-1');
  });
});
