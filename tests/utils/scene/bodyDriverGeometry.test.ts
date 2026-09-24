/**
 * bodyDriverGeometry — the seed→camera-geometry mapping the `body` selection arm
 * stamps on every row. Every field is `number | null` and the camera reads them
 * positionally, so a swapped ground/bounding radius or a dropped per-seed
 * override is invisible to the compiler: each arm of the seed union is asserted
 * against the seed's own fields, never against the helpers the mapping calls.
 */

import { describe, it, expect } from 'vitest';

import { bodyDriverGeometry } from '../../../src/utils/scene/bodyDriverGeometry';
import { SCENE_PLANETS } from '../../../src/data/bodies/scenePlanets';
import { SCENE_MESH_BODIES } from '../../../src/data/bodies/sceneMeshBodies';
import { SGR_A_STAR } from '../../../src/data/bodies/sceneSgrAStar';
import { SURFACE_STANDOFF_RADII } from '../../../src/utils/camera/clampDistance';
import { findByIdOrThrow } from '../../../src/utils/object/findByIdOrThrow';

const MARS = findByIdOrThrow(SCENE_PLANETS, 'mars', 'test');
const WHALE = findByIdOrThrow(SCENE_MESH_BODIES, 'whale', 'test');

describe('bodyDriverGeometry', () => {
  it('a planet reports its datum as ground, the outer bound as footprint, and the global standoff', () => {
    const driver = bodyDriverGeometry('mars');
    expect(driver).toEqual({
      poseId: 'mars',
      // The outer bound: Olympus Mons is inside whatever the camera frames.
      boundingRadiusM: MARS.surface.datumRadiusM + MARS.surface.reliefM[1],
      footprintRadiusM: MARS.surface.datumRadiusM + MARS.surface.reliefM[1],
      // The ground is the DATUM, never the relief-topped outer bound: the tilt
      // mapping and the zoom taper measure altitude over it.
      groundRadiusM: MARS.surface.datumRadiusM,
      standoffRadii: SURFACE_STANDOFF_RADII,
    });
    expect(driver.footprintRadiusM).toBeGreaterThan(driver.groundRadiusM!);
  });

  it('a mesh body reports NO ground and its own standoff — a bake hull is not a surface', () => {
    expect(bodyDriverGeometry('whale')).toEqual({
      poseId: 'whale',
      boundingRadiusM: WHALE.boundingRadiusM,
      footprintRadiusM: WHALE.boundingRadiusM,
      groundRadiusM: null,
      standoffRadii: WHALE.standoffRadii,
    });
    expect(WHALE.standoffRadii).not.toBe(SURFACE_STANDOFF_RADII); // an override, not the global
  });

  it('Sgr A* carries its arrival distance and descent floor off the seed', () => {
    const driver = bodyDriverGeometry('sgr-a-star');
    expect(driver.focusDistanceRadii).toBe(30.4);
    expect(driver.standoffRadii).toBe(2);
    expect(driver.groundRadiusM).toBe(SGR_A_STAR.surface.datumRadiusM);
  });

  it('leaves focusDistanceRadii absent for a body with no arrival override', () => {
    // An `undefined` key would be a serialized row field the store carries for
    // every body; absence is what `bodyLikeFraming`'s optional argument reads.
    expect('focusDistanceRadii' in bodyDriverGeometry('mars')).toBe(false);
  });
});
