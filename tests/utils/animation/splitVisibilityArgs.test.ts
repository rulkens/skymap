/**
 * splitVisibilityArgs — separates a show/hide layer list into atomic
 * VisibilityLayerKeys (aggregates expanded) and 'family:scope' scoped entries.
 */

import { describe, it, expect } from 'vitest';
import { splitVisibilityArgs } from '../../../src/utils/animation/splitVisibilityArgs';

describe('splitVisibilityArgs', () => {
  it('passes a purely atomic list through with no scoped entries', () => {
    expect(splitVisibilityArgs(['flow', 'filaments'])).toEqual({
      layers: ['flow', 'filaments'],
      scoped: [],
    });
  });

  it('separates scoped entries from atomic keys, preserving each order', () => {
    expect(
      splitVisibilityArgs(['volumesMaster', 'survey:milliquas', 'flow', 'structureRing:group']),
    ).toEqual({
      layers: ['volumesMaster', 'flow'],
      scoped: ['survey:milliquas', 'structureRing:group'],
    });
  });

  it("expands the 'labels' aggregate while splitting", () => {
    expect(splitVisibilityArgs(['labels', 'label:milkyWay'])).toEqual({
      layers: ['surveyLabel', 'structureLabel', 'milkyWayLabel', 'starCatalogLabel', 'bodyLabel'],
      scoped: ['label:milkyWay'],
    });
  });
});
