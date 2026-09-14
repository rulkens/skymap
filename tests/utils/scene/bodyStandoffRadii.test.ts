/**
 * bodyStandoffRadii — the one home of the standoff fallback. The union widening
 * it hides is easy to get wrong: `'standoffRadii' in body` alone types the
 * absent arms' field as `unknown`, so a reader who drops the `typeof` guard
 * either fails to compile or reaches for a cast that would let a non-number
 * through as a floor multiple.
 */

import { describe, it, expect } from 'vitest';

import { bodyStandoffRadii } from '../../../src/utils/scene/bodyStandoffRadii';
import { SURFACE_STANDOFF_RADII } from '../../../src/utils/camera/clampDistance';
import { SGR_A_STAR } from '../../../src/data/bodies/sceneSgrAStar';
import { SCENE_PLANETS } from '../../../src/data/bodies/scenePlanets';
import { findByIdOrThrow } from '../../../src/utils/object/findByIdOrThrow';

describe('bodyStandoffRadii', () => {
  it('falls back to the shared constant for a body with no override', () => {
    const mars = findByIdOrThrow(SCENE_PLANETS, 'mars', 'test');
    expect(bodyStandoffRadii(mars)).toBe(SURFACE_STANDOFF_RADII);
  });

  it('returns the body’s own override where it has one', () => {
    expect(bodyStandoffRadii(SGR_A_STAR)).toBe(2.0);
  });
});
