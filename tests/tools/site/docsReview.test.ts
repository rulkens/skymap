import { describe, expect, it } from 'vitest';

import type { DocsReview } from '../../../tools/site/@types/DocsReview';
import { docsReviewStem } from '../../../tools/site/utils/docsReviewStem';
import { isDocsReview } from '../../../tools/site/utils/isDocsReview';

const review: DocsReview = {
  page: '/docs/start/scene/',
  words: { before: 1632 },
  marks: [
    { id: 'm1', text: 'A sentence.', reason: 'why', state: 'cut' },
    { id: 'm2', text: 'Another.', reason: 'owner', state: 'rewrite' },
  ],
};

describe('docsReviewStem', () => {
  it('turns the page path into a file stem', () => {
    expect(docsReviewStem('/docs/start/scene/')).toBe('docs-start-scene');
    expect(docsReviewStem('/features/')).toBe('features');
  });

  it('gives the home page the stem index', () => {
    expect(docsReviewStem('/')).toBe('index');
  });

  // The page comes off a query string and becomes a file name.
  it('refuses a path that climbs out or holds anything but path characters', () => {
    expect(docsReviewStem('features')).toBeNull();
    expect(docsReviewStem('/docs/../../etc/passwd')).toBeNull();
    expect(docsReviewStem('/docs/a b/')).toBeNull();
  });
});

describe('isDocsReview', () => {
  it('accepts the cutter shape', () => {
    expect(isDocsReview(review)).toBe(true);
    expect(isDocsReview({ ...review, marks: [] })).toBe(true);
  });

  it('refuses a body with a missing field or a wrong state', () => {
    expect(isDocsReview(null)).toBe(false);
    expect(isDocsReview({ ...review, page: undefined })).toBe(false);
    expect(isDocsReview({ ...review, words: {} })).toBe(false);
    expect(isDocsReview({ ...review, marks: [{ ...review.marks[0], state: 'maybe' }] })).toBe(
      false,
    );
    expect(isDocsReview({ ...review, marks: [{ ...review.marks[0], text: '  ' }] })).toBe(false);
  });

  it('accepts a rewrite with its replacement text and instruction, and refuses either that is not text', () => {
    const rewrite = { ...review.marks[1], after: 'Better wording.', how: 'shorter' };
    expect(isDocsReview({ ...review, marks: [rewrite] })).toBe(true);
    expect(isDocsReview({ ...review, marks: [{ ...rewrite, after: 3 }] })).toBe(false);
    expect(isDocsReview({ ...review, marks: [{ ...rewrite, how: ['shorter'] }] })).toBe(false);
  });

  it('accepts a good mark with its reason and refuses a reason that is not text', () => {
    const good = { ...review.marks[0], state: 'good', why: 'Says it plainly.' };
    expect(isDocsReview({ ...review, marks: [good] })).toBe(true);
    expect(isDocsReview({ ...review, marks: [{ ...good, why: 1 }] })).toBe(false);
  });

  it('accepts an apply request and an applied history, and refuses ones of the wrong shape', () => {
    const apply = { scope: 'page', requested: '2026-10-08T19:00:00Z' };
    const applied = [{ commit: 'abc1234', at: '2026-10-08T19:05:00Z', markIds: ['m1'] }];
    expect(isDocsReview({ ...review, apply, applied })).toBe(true);
    expect(isDocsReview({ ...review, apply: { scope: 'page' } })).toBe(false);
    expect(
      isDocsReview({ ...review, applied: [{ commit: 'abc1234', at: 'x', markIds: [1] }] }),
    ).toBe(false);
    expect(isDocsReview({ ...review, applied: 'abc1234' })).toBe(false);
  });

  it('refuses two marks with one id, which the page could not tell apart', () => {
    expect(isDocsReview({ ...review, marks: [review.marks[0], review.marks[0]] })).toBe(false);
  });
});
