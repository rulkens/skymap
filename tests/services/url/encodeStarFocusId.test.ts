/**
 * encodeStarFocusId — which half of the `star-` grammar a ref lands in. A seeded
 * ref must name its DURABLE id: encoding its table index instead would survive
 * every round-trip test and still break every saved link the day a seed table
 * gains a row.
 */

import { describe, it, expect } from 'vitest';

import { encodeStarFocusId } from '../../../src/services/url/encodeStarFocusId';
import { SCENE_STARS } from '../../../src/data/bodies/sceneStars';
import { SCENE_S_STARS } from '../../../src/data/bodies/sceneSStars';
import { Source } from '../../../src/data/sources';

describe('encodeStarFocusId', () => {
  it('names a seeded star by its seed id, from any seeded table', () => {
    expect(
      encodeStarFocusId({
        type: 'starCatalog',
        source: Source.FamousStar,
        index: SCENE_STARS.findIndex((star) => star.id === 'sirius'),
      }),
    ).toBe('star-sirius');
    expect(encodeStarFocusId({ type: 'starCatalog', source: Source.Sun, index: 0 })).toBe(
      'star-sun',
    );
    expect(
      encodeStarFocusId({
        type: 'starCatalog',
        source: Source.SStar,
        index: SCENE_S_STARS.findIndex((star) => star.id === 's2'),
      }),
    ).toBe('star-s2');
  });

  it('names a survey star by its bin index — the only identity it has', () => {
    expect(encodeStarFocusId({ type: 'starCatalog', source: Source.GaiaStars, index: 42 })).toBe(
      'star-42',
    );
  });
});
