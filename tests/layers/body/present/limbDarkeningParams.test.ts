/**
 * limbDarkeningParams — key-resolution drift-catcher (spec §10). The table is eye-tuned data, so
 * its values carry no test; a key naming no real body (typo, renamed seed) would silently pack the
 * identity.
 */

import { describe, expect, it } from 'vitest';

import { LIMB_DARKENING_PARAMS } from '../../../../src/layers/body/present/limbDarkeningParams';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';

describe('LIMB_DARKENING_PARAMS', () => {
  it('every key resolves to a real seeded body', () => {
    const seeded = new Set<string>([SCENE_EARTH.id, ...SCENE_PLANETS.map((b) => b.id)]);
    for (const id of Object.keys(LIMB_DARKENING_PARAMS)) expect(seeded.has(id)).toBe(true);
  });
});
