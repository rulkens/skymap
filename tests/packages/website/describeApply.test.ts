import { describe, expect, it } from 'vitest';

import type { DocsReviewMark } from '../../../tools/site/@types/DocsReviewMark';
import { describeApply } from '../../../packages/website/src/dev/review/describeApply';

const mark = (state: DocsReviewMark['state'], text: string, after?: string): DocsReviewMark => ({
  id: text,
  text,
  reason: 'r',
  state,
  after,
});

describe('describeApply', () => {
  it('states removals, the word change, rewrites with text and rewrites left to the rewriter', () => {
    const marks = [
      mark('cut', 'one two three'),
      mark('cut', 'four five'),
      mark('rewrite', 'six seven eight', 'six'),
      mark('rewrite', 'nine ten'),
      mark('keep', 'eleven'),
    ];
    expect(describeApply(marks, 100)).toEqual({
      text: 'removes 2 passages · 100 → 93 words · 1 rewrite with text · 1 left for the rewriter',
      nothing: false,
    });
  });

  it('says there is nothing to apply when no passage is cut or marked for rewrite', () => {
    expect(describeApply([mark('keep', 'a'), mark('good', 'b')], 50).nothing).toBe(true);
    expect(describeApply([], 50).nothing).toBe(true);
  });
});
