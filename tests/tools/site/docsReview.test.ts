import { describe, expect, it } from 'vitest';

import type { DocsReview } from '../../../tools/site/@types/DocsReview';
import { docsReviewStem } from '../../../tools/site/utils/docsReviewStem';
import { isDocsReview } from '../../../tools/site/utils/isDocsReview';

const review: DocsReview = {
  page: '/docs/start/scene/',
  job: 'What am I looking at?',
  words: { before: 1632 },
  marks: [
    { id: 'm1', text: 'A sentence.', reason: 'why', state: 'cut' },
    { id: 'm2', text: 'Another.', reason: 'owner', state: 'rewrite' },
  ],
};

describe('docsReviewStem', () => {
  it('turns the page path into a file stem', () => {
    expect(docsReviewStem('/docs/start/scene/')).toBe('docs-start-scene');
  });

  // The page comes off a query string and becomes a file name.
  it('refuses a path that is not a docs path or that climbs out', () => {
    expect(docsReviewStem('/home/')).toBeNull();
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
    expect(isDocsReview({ ...review, job: undefined })).toBe(false);
    expect(isDocsReview({ ...review, words: {} })).toBe(false);
    expect(isDocsReview({ ...review, marks: [{ ...review.marks[0], state: 'maybe' }] })).toBe(
      false,
    );
    expect(isDocsReview({ ...review, marks: [{ ...review.marks[0], text: '  ' }] })).toBe(false);
  });

  it('refuses two marks with one id, which the page could not tell apart', () => {
    expect(isDocsReview({ ...review, marks: [review.marks[0], review.marks[0]] })).toBe(false);
  });
});
