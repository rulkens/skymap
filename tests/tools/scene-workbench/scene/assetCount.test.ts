import { describe, expect, it } from 'vitest';
import { assetCount } from '../../../../tools/scene-workbench/src/scene/assetCount';
import type { TexturedMeshAsset } from '../../../../tools/scene-workbench/@types/TexturedMeshAsset';

const MESH_ASSET: TexturedMeshAsset = {
  id: 'a1',
  label: 'Facade mesh',
  transform: { translationM: [0, 0, 0], rotation: [0, 0, 0, 1], scale: 1 },
  provenance: {
    source: 'nationalGeodataApi',
    sourceVintage: '2024-01-01',
    pipeline: [{ step: 'bake-mesh', version: '1' }],
  },
  kind: 'mesh',
  triangleCount: 1_234,
  artifactUrl: 'geo3d/g1/a1/mesh.glb',
};

describe('assetCount', () => {
  it('reports tris for a mesh asset', () => {
    expect(assetCount(MESH_ASSET)).toEqual({ count: 1234, unit: 'tris' });
  });
});
