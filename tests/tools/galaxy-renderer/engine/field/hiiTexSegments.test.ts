/**
 * hiiTexSegments — the filter drawFrame's merged and timing-split HII
 * passes both apply to decide what still draws into `hiiTex` now that DIG
 * has its own target (tools/galaxy-renderer/src/engine/field/hiiTexSegments.ts).
 */
import { describe, expect, it } from 'vitest';
import { hiiTexSegments } from '../../../../../tools/galaxy-renderer/src/engine/field/hiiTexSegments';

describe('hiiTexSegments', () => {
  it('drops the hii:dig segment and keeps the rest in order', () => {
    const segments = [
      { label: 'hii:shells', first: 0, count: 10 },
      { label: 'hii:dig', first: 10, count: 20 },
      { label: 'hii:young', first: 30, count: 5 },
      { label: 'hii:extras', first: 35, count: 8 },
    ];

    expect(hiiTexSegments(segments)).toEqual([
      { label: 'hii:shells', first: 0, count: 10 },
      { label: 'hii:young', first: 30, count: 5 },
      { label: 'hii:extras', first: 35, count: 8 },
    ]);
  });

  it('drops zero-count segments alongside hii:dig', () => {
    const segments = [
      { label: 'hii:shells', first: 0, count: 0 },
      { label: 'hii:dig', first: 0, count: 40 },
      { label: 'hii:young', first: 40, count: 0 },
    ];

    expect(hiiTexSegments(segments)).toEqual([]);
  });

  it('is a no-op when there is no dig content and every other segment is nonempty', () => {
    const segments = [
      { label: 'hii:shells', first: 0, count: 10 },
      { label: 'hii:dig', first: 10, count: 0 },
      { label: 'hii:young', first: 10, count: 5 },
    ];

    expect(hiiTexSegments(segments)).toEqual([
      { label: 'hii:shells', first: 0, count: 10 },
      { label: 'hii:young', first: 10, count: 5 },
    ]);
  });
});
