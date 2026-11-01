/**
 * BODY_SLAB_ROWS — the two radii are DIFFERENT facts for a shelled body, and
 * the row is what both culls and the near plane read, so a row collapsing
 * them would shrink Saturn's rings out of the cull without any type error.
 */

import { describe, it, expect } from 'vitest';

import { BODY_SLAB_ROWS } from '../../../../src/layers/body/present/bodySlabRows';
import { bodyDrawRadiusM } from '../../../../src/layers/body/present/bodyDrawRadiusM';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { bodyFootprintRadiusM } from '../../../../src/utils/scene/bodyFootprintRadiusM';

describe('BODY_SLAB_ROWS', () => {
  it("carries Saturn's ring-inclusive draw radius apart from its footprint", () => {
    const saturn = SCENE_PLANETS.find((planet) => planet.id === 'saturn');
    const row = BODY_SLAB_ROWS.find((candidate) => candidate.anchorId === 'saturn');
    if (saturn === undefined || row === undefined) throw new Error('no saturn row');

    expect(row.footprintRadiusM).toBe(bodyFootprintRadiusM(saturn));
    expect(row.drawRadiusM(1e12, 1000)).toBe(bodyDrawRadiusM(saturn));
    expect(row.drawRadiusM(1e12, 1000)).toBeGreaterThan(row.footprintRadiusM);
  });
});
