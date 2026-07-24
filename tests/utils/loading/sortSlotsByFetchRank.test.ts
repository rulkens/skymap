/**
 * The tiebreak is the whole point of this comparator: body textures all rank
 * 10 and star catalogs all rank 50, so without a second key the panel would
 * fall back to slot-Map insertion order — an artifact of which bootstrap phase
 * minted each slot. These cases pin the two rules that aren't visible from the
 * rank alone (name tiebreak, unranked-last) against inputs whose incoming order
 * disagrees with the expected output.
 */

import { describe, it, expect } from 'vitest';
import { sortSlotsByFetchRank } from '../../../src/utils/loading/sortSlotsByFetchRank';

const rows = (...names: string[]) => names.map((name) => ({ name }));
const named = (sorted: { name: string }[]) => sorted.map((r) => r.name);

describe('sortSlotsByFetchRank', () => {
  it('breaks a shared rank by name rather than by input order', () => {
    const ranks = new Map([
      ['body-texture:mars', 10],
      ['body-texture:earth', 10],
      ['starCatalog:gaiaStars', 50],
    ]);
    const sorted = sortSlotsByFetchRank(
      rows('starCatalog:gaiaStars', 'body-texture:mars', 'body-texture:earth'),
      ranks,
    );
    expect(named(sorted)).toEqual([
      'body-texture:earth',
      'body-texture:mars',
      'starCatalog:gaiaStars',
    ]);
  });

  it('sorts unranked slots last as a block, not first or dropped', () => {
    const ranks = new Map([['glade-points', 62]]);
    const sorted = sortSlotsByFetchRank(
      rows('debug-spherical', 'debug-cartesian', 'glade-points'),
      ranks,
    );
    expect(named(sorted)).toEqual(['glade-points', 'debug-cartesian', 'debug-spherical']);
  });
});
