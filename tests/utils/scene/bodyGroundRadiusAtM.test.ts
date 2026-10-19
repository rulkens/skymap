/**
 * The camera's ground for a mesh-drawn moon must sit on the mesh's outer bound,
 * or zoom/drag settles inside Phobos' long end (the datum is 11 km, the mesh
 * reaches 13.94 km). Real rows, so a lost `reliefM` or presentation fails here.
 */

import { describe, expect, it } from 'vitest';

import { SCENE_CELESTIAL_BODIES } from '../../../src/data/bodies/sceneCelestialBodies';
import { MESH_PRESENTATIONS } from '../../../src/data/bodies/meshPresentations';
import { bodyGroundRadiusAtM } from '../../../src/utils/scene/bodyGroundRadiusAtM';

const row = (id: string) => SCENE_CELESTIAL_BODIES.find((body) => body.id === id)!;

describe('bodyGroundRadiusAtM', () => {
  it.each(['phobos', 'deimos'])(
    'puts %s’s ground outside its whole mesh, whatever the terrain',
    (id) => {
      const meshRadiusM = MESH_PRESENTATIONS.find((p) => p.id === id)!.boundingRadiusM;
      expect(bodyGroundRadiusAtM(row(id), 0)).toBeGreaterThanOrEqual(meshRadiusM);
      expect(bodyGroundRadiusAtM(row(id), -5000)).toBeGreaterThanOrEqual(meshRadiusM);
    },
  );

  it('keeps a sphere body on its datum plus terrain', () => {
    expect(bodyGroundRadiusAtM(row('mars'), 1234)).toBe(row('mars').surface.datumRadiusM + 1234);
  });
});
