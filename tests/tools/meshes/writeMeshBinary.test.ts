import { describe, it, expect } from 'vitest';

import { decodeMesh } from '../../../src/data/mesh/meshBinaryFormat';
import { writeMeshBinary } from '../../../tools/meshes/writeMeshBinary';

describe('writeMeshBinary()', () => {
  it('round-trips through decodeMesh', () => {
    // Writer and reader are pinned by one another, the posture
    // decodeFilaments/filamentFetcher share: a header-offset slip on either
    // side has nowhere to hide.
    const geometry = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0]),
      tangents: new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, -1, 0, 0, 1, -1]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      indices: new Uint32Array([0, 1, 2, 2, 1, 3]),
      boundingRadiusM: 6.5,
    };

    const decoded = decodeMesh(writeMeshBinary(geometry));

    expect(decoded.vertexCount).toBe(4);
    expect(decoded.indexCount).toBe(6);
    expect(decoded.boundingRadiusM).toBe(6.5);
    expect(decoded.positions).toEqual(geometry.positions);
    expect(decoded.normals).toEqual(geometry.normals);
    expect(decoded.tangents).toEqual(geometry.tangents);
    expect(decoded.uvs).toEqual(geometry.uvs);
    expect(decoded.indices).toEqual(geometry.indices);
  });
});
