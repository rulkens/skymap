/**
 * bodySlabRowOf — the adapter every store-fed slab candidate goes through.
 * The two radii are DIFFERENT facts for a shelled body, and the row is what
 * both culls and the near plane now read, so a row collapsing them would
 * shrink Saturn's rings out of the cull without any type error.
 */

import { describe, it, expect } from 'vitest';

import { bodySlabRowOf } from '../../../src/utils/scene/bodySlabRowOf';
import { SCENE_PLANETS } from '../../../src/data/bodies/scenePlanets';
import { bodyDrawRadiusM } from '../../../src/utils/scene/bodyDrawRadiusM';
import { bodyFootprintRadiusM } from '../../../src/utils/scene/bodyFootprintRadiusM';

describe('bodySlabRowOf', () => {
  it('carries bodyDrawRadiusM and bodyFootprintRadiusM as distinct radii, source foreground', () => {
    const saturn = SCENE_PLANETS.find((planet) => planet.id === 'saturn');
    if (saturn === undefined) throw new Error('SCENE_PLANETS is missing saturn');

    const row = bodySlabRowOf(saturn);

    expect(row).toEqual({
      anchorId: 'saturn',
      boundingRadiusM: bodyDrawRadiusM(saturn),
      footprintRadiusM: bodyFootprintRadiusM(saturn),
      source: 'foreground',
    });
    // The ring-inclusive draw radius is the one that must not collapse onto
    // the datum-derived footprint.
    expect(row.boundingRadiusM).toBeGreaterThan(row.footprintRadiusM);
  });
});
