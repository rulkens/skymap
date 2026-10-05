/**
 * decodeStarFocusId — the seeded/survey split and the survey deferral. A seeded
 * id must decode with no bin loaded (the link works on a cold boot), and a bin
 * index must NOT (D6'1: the deep link defers at the ref stage until its bin
 * commits, rather than naming a record nothing can extract).
 */

import { describe, it, expect } from 'vitest';

import { decodeStarFocusId } from '../../../src/services/url/decodeStarFocusId';
import { SCENE_STARS } from '../../../src/data/bodies/sceneStars';
import { SCENE_S_STARS } from '../../../src/data/bodies/sceneSStars';
import { Source } from '../../../src/data/sources';

describe('decodeStarFocusId', () => {
  it('resolves a seed id to its own table and index, with no survey loaded', () => {
    expect(decodeStarFocusId('star-sirius', false)).toEqual({
      type: 'starCatalog',
      source: Source.FamousStar,
      index: SCENE_STARS.findIndex((star) => star.id === 'sirius'),
    });
    expect(decodeStarFocusId('star-sun', false)).toEqual({
      type: 'starCatalog',
      source: Source.Sun,
      index: 0,
    });
    expect(decodeStarFocusId('star-s2', false)).toEqual({
      type: 'starCatalog',
      source: Source.SStar,
      index: SCENE_S_STARS.findIndex((star) => star.id === 's2'),
    });
  });

  it('defers an all-digits remainder until a survey catalog is loaded', () => {
    expect(decodeStarFocusId('star-42', false)).toBeNull();
    expect(decodeStarFocusId('star-42', true)).toEqual({
      type: 'starCatalog',
      source: Source.GaiaStars,
      index: 42,
    });
  });

  it('rejects an id no seed table holds', () => {
    expect(decodeStarFocusId('star-krypton', true)).toBeNull();
    expect(decodeStarFocusId('star-1.5', true)).toBeNull();
    expect(decodeStarFocusId('star--1', true)).toBeNull();
  });
});
