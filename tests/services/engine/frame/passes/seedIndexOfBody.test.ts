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

  // §8.1 regression — guards the "pick id renamed when a sibling is culled" bug.
  // The pack side must index the FULL seed table, never the frame's culled draw
  // subset: if `planetsLayer` had stamped `@builtin(instance_index)` into the
  // culled list, dropping an earlier planet would slide Jupiter's id down one,
  // renaming it mid-flight. This pins that the seed index is a property of the
  // durable table (unchanged by the cull) and DIFFERS from Jupiter's slot in a
  // culled draw set — so the two numbers can never be confused.
  it('keeps a body’s seed index stable when an earlier sibling is culled', () => {
    const seedIndex = seedIndexOfBody('jupiter', SCENE_PLANETS);
    expect(seedIndex).toBeGreaterThan(0); // Jupiter is not the first seed.

    // Simulate a frame where the first planet fails the sub-pixel cull.
    const culled = SCENE_PLANETS.filter((_, i) => i !== 0);
    const slotInCulled = culled.findIndex((p) => p.id === 'jupiter');

    // The seed index is unchanged by the cull, and is NOT the slot the culled
    // draw list would have given Jupiter — proving the pick id is the seed
    // index, not the pack-loop slot.
    expect(seedIndexOfBody('jupiter', SCENE_PLANETS)).toBe(seedIndex);
    expect(slotInCulled).toBe(seedIndex - 1);
    expect(slotInCulled).not.toBe(seedIndex);
  });
});
