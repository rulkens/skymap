/**
 * seedIndexOfBody — unit tests for the stable seed-index lookup the body
 * `drawPick`s compose their pick ids from.
 *
 * The index is a body's position in its DURABLE seed table (`SCENE_PLANETS`
 * for planets, `SCENE_STARS` for stars), NOT its slot in the frame's
 * camera-dependent resolved/point partition — which shifts as bodies enter
 * and leave the drawn set. Pinning the lookup against the real seed tables
 * (rather than a synthetic array a numbering bug could accidentally satisfy)
 * proves a body id maps to the same index the resolve side will decode
 * against, and that an unknown id returns −1 so the caller can defensively
 * skip it rather than mint a packed id that aliases another body.
 *
 * The §8.1 "seed index, not the pack-loop slot" regression lives where the bug
 * could actually be introduced — the `drawPick` call site — as a behavioural
 * test in `starSpheresLayer.test.ts`: a captured pick id whose decoded index is
 * the star's SCENE_STARS row, differing from its slot in the culled sphere
 * list. Restating that relationship here over a locally-filtered copy of the
 * seed table would only re-test `findIndex` against itself, so these are plain
 * helper tests, not the regression.
 */

import { describe, it, expect } from 'vitest';

import { seedIndexOfBody } from '../../../../../src/services/engine/frame/passes/seedIndexOfBody';
import { SCENE_PLANETS } from '../../../../../src/data/bodies/scenePlanets';
import { SCENE_STARS } from '../../../../../src/data/bodies/sceneStars';

describe('seedIndexOfBody', () => {
  it('returns a planet id’s position in the SCENE_PLANETS seed table', () => {
    // Every seeded planet resolves to its own row index — the durable identity
    // the pick id carries, invariant under which planets clear the cull.
    SCENE_PLANETS.forEach((planet, index) => {
      expect(seedIndexOfBody(planet.id, SCENE_PLANETS)).toBe(index);
    });
  });

  it('returns a star id’s position in the SCENE_STARS seed table', () => {
    SCENE_STARS.forEach((star, index) => {
      expect(seedIndexOfBody(star.id, SCENE_STARS)).toBe(index);
    });
  });

  it('returns −1 for an id absent from the seed table', () => {
    // An unknown id must NOT collapse onto index 0 (or any real row): the
    // caller skips a −1 rather than stamping a pick id that aliases body 0.
    expect(seedIndexOfBody('no-such-body', SCENE_PLANETS)).toBe(-1);
    expect(seedIndexOfBody('no-such-body', SCENE_STARS)).toBe(-1);
  });
});
