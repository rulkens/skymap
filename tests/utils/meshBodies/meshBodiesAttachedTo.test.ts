import { describe, it, expect, vi } from 'vitest';

// The presentation table is mocked so this tests the JOIN, not today's rows: an
// assertion over the real `MESH_PRESENTATIONS` would pass for a function that
// ignored the host entirely. The ids stay real so `meshBodySlabHostId` (reading
// the real position-driver tables) resolves their host to `'earth'`.
vi.mock('../../../src/data/bodies/meshPresentations', () => ({
  MESH_PRESENTATIONS: [
    { id: 'whale', meshKey: 'whale', boundingRadiusM: 1, resolvePx: 3 },
    { id: 'petunias', meshKey: 'petunias', boundingRadiusM: 1, resolvePx: 3 },
  ],
}));

import { meshBodiesAttachedTo } from '../../../src/utils/meshBodies/meshBodiesAttachedTo';
import type { PositionedId } from '../../../src/@types/scene/PositionedId';

describe('meshBodiesAttachedTo', () => {
  it('returns the mesh bodies whose focus matches the host id', () => {
    const attached = meshBodiesAttachedTo('earth');
    expect(attached.map((b) => b.id).sort()).toEqual(['petunias', 'whale']);
  });

  it('returns none for a host no mesh body is focused on', () => {
    expect(meshBodiesAttachedTo('mars')).toEqual([]);
  });
});
