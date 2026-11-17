/**
 * decodeStarFocusId — the seeded/survey split and the survey deferral. A seeded
 * id must decode with no bin loaded (the link works on a cold boot), and a bin
 * index must answer pending (D6'1: the deep link defers until its bin commits,
 * rather than naming a record nothing can extract).
 */

import { describe, it, expect } from 'vitest';

import { decodeStarFocusId } from '../../../../../src/layers/starCatalog/selection/utils/decodeStarFocusId';
import { SCENE_STARS } from '../../../../../src/data/bodies/sceneStars';
import { SCENE_S_STARS } from '../../../../../src/data/bodies/sceneSStars';

const ABSENT = { kind: 'absent' };
const hit = (source: string, index: number) => ({
  kind: 'hit',
  ref: { type: 'starCatalog', source, index },
});

describe('decodeStarFocusId', () => {
  it('resolves a seed id to its own table and index, with no survey loaded', () => {
    expect(decodeStarFocusId('star-sirius', false)).toEqual(
      hit(
        'famousStar',
        SCENE_STARS.findIndex((star) => star.id === 'sirius'),
      ),
    );
    expect(decodeStarFocusId('star-sun', false)).toEqual(hit('sun', 0));
    expect(decodeStarFocusId('star-s2', false)).toEqual(
      hit(
        'sStar',
        SCENE_S_STARS.findIndex((star) => star.id === 's2'),
      ),
    );
  });

  it('an all-digits remainder is pending until a survey catalog is loaded', () => {
    expect(decodeStarFocusId('star-42', false)).toEqual({ kind: 'pending' });
    expect(decodeStarFocusId('star-42', true)).toEqual(hit('gaiaStars', 42));
  });

  it('rejects an id no seed table holds', () => {
    expect(decodeStarFocusId('star-krypton', true)).toEqual(ABSENT);
    expect(decodeStarFocusId('star-1.5', true)).toEqual(ABSENT);
    expect(decodeStarFocusId('star--1', true)).toEqual(ABSENT);
  });
});
