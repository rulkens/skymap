// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { paintMark } from '../../../packages/website/src/dev/review/paintMark';

describe('paintMark', () => {
  // A Features row: the name and its line are two elements in one list item, with no
  // space between them in the DOM; the browser's selection text has one.
  it('finds a selection that runs across two elements of one block', () => {
    document.body.innerHTML =
      '<ul><li><a href="#">Tour controls</a><span>next, previous, pause and leave</span></li></ul>';
    const found = paintMark(document.body, {
      id: 'owner-1',
      text: 'Tour controls\nnext, previous, pause and leave',
      reason: 'owner',
      state: 'cut',
    });
    expect(found).toBe(true);
    expect(document.querySelector('li')!.getAttribute('data-review-id')).toBe('owner-1');
  });
});
