import { describe, it, expect, vi } from 'vitest';

// SCENE_MESH_BODIES is empty until Task 18, so a test run against the real
// (empty) seed table would make both assertions below pass vacuously. Fixture
// rows here use the real Task 6 `whale`/`petunias` ids so `elementsById`
// (reading the real ORBITAL_ELEMENTS table) resolves their `focusId: 'earth'`.
vi.mock('../../../src/data/bodies/sceneMeshBodies', () => ({
  SCENE_MESH_BODIES: [
    {
      id: 'whale',
      label: 'Whale',
      radiusM: 1,
      albedo: [1, 1, 1],
      meshKey: 'whale',
      description: '',
    },
    {
      id: 'petunias',
      label: 'Petunias',
      radiusM: 1,
      albedo: [1, 1, 1],
      meshKey: 'petunias',
      description: '',
    },
  ],
}));

import { meshBodiesAttachedTo } from '../../../src/utils/scene/meshBodiesAttachedTo';

describe('meshBodiesAttachedTo', () => {
  it('returns the mesh bodies whose focus matches the host id', () => {
    const attached = meshBodiesAttachedTo('earth');
    expect(attached.map((b) => b.id).sort()).toEqual(['petunias', 'whale']);
  });

  it('returns none for a host no mesh body is focused on', () => {
    expect(meshBodiesAttachedTo('mars')).toEqual([]);
  });
});
