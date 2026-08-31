/**
 * findHiiSegment — the lookup `drawFrame`'s per-tier and `hii:extras` passes
 * both use to find their own span in `model.hiiSegments`
 * (tools/galaxy-renderer/src/engine/field/findHiiSegment.ts).
 */
import { describe, expect, it } from 'vitest';
import { findHiiSegment } from '../../../../../../src/services/gpu/renderers/galaxyField/field/findHiiSegment';

describe('findHiiSegment', () => {
  const segments = [
    { label: 'hii:shells', first: 0, count: 10 },
    { label: 'hii:dig', first: 10, count: 20 },
    { label: 'hii:young', first: 30, count: 0 },
    { label: 'hii:extras', first: 30, count: 8 },
  ];

  it('finds a nonempty segment by label', () => {
    expect(findHiiSegment(segments, 'hii:shells')).toEqual({
      label: 'hii:shells',
      first: 0,
      count: 10,
    });
  });

  it('returns undefined for a zero-count segment rather than the empty row', () => {
    expect(findHiiSegment(segments, 'hii:young')).toBeUndefined();
  });

  it('returns undefined for a label with no span at all', () => {
    expect(findHiiSegment(segments, 'hii:missing')).toBeUndefined();
  });
});
