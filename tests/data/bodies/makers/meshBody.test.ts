import { describe, it, expect, vi } from 'vitest';

// Fixture table stands in for the generated MESH_ASSETS — the maker must
// join against whatever that module exports, not against real baked data.
vi.mock('../../../../src/data/bodies/meshAssets.generated', () => ({
  MESH_ASSETS: {
    'test-mesh': {
      key: 'test-mesh',
      path: 'meshes/test-mesh.mesh',
      boundingRadiusM: 12345,
      meanAlbedo: [0.1, 0.2, 0.3],
      triangleCount: 100,
      normalMapSubstituted: false,
      source: 'fixture',
      licence: 'CC0',
      attribution: '',
    },
  },
}));

import { meshBody } from '../../../../src/data/bodies/makers/meshBody';

describe('meshBody()', () => {
  it('joins a seed with its MESH_ASSETS row', () => {
    const body = meshBody({
      id: 'x',
      label: 'X',
      meshKey: 'test-mesh',
    });

    expect(body).toEqual({
      id: 'x',
      label: 'X',
      meshKey: 'test-mesh',
      boundingRadiusM: 12345,
      albedo: [0.1, 0.2, 0.3],
      standoffRadii: 2,
    });
  });

  it('throws for an unknown meshKey', () => {
    expect(() => meshBody({ id: 'y', label: 'Y', meshKey: 'no-such-key' })).toThrow(/no-such-key/);
  });
});
