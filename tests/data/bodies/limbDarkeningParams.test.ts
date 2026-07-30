/**
 * limbDarkeningParams — the key-resolution drift-catcher (spec §10).
 *
 * The table is eye-tuned data, so its `strength`/`exponent` values carry no test
 * (a numeric restatement would fail on every legitimate tweak). The one thing a
 * test CAN catch is a key that names no real body — a typo or a renamed seed
 * that would silently pack the identity for a body the author meant to darken.
 */

import { describe, expect, it } from 'vitest';

import { LIMB_DARKENING_PARAMS } from '../../../src/data/bodies/limbDarkeningParams';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../src/data/bodies/scenePlanets';

describe('LIMB_DARKENING_PARAMS', () => {
  it('every key resolves to a real seeded body', () => {
    const seeded = new Set<string>([SCENE_EARTH.id, ...SCENE_PLANETS.map((b) => b.id)]);
    for (const id of Object.keys(LIMB_DARKENING_PARAMS)) expect(seeded.has(id)).toBe(true);
  });
});
