import { describe, it, expect } from 'vitest';
import {
  decodeMesh,
  MESH_HEADER_BYTES,
  MESH_MAGIC,
  MESH_VERSION_OFFSET,
} from '../../../src/data/mesh/meshBinaryFormat';

describe('mesh binary format (SKMH v3)', () => {
  it('rejects a bad magic', async () => {
    await expect(decodeMesh(new ArrayBuffer(MESH_HEADER_BYTES))).rejects.toThrow(/magic/);
  });

  it('rejects a v2 file', async () => {
    // A v2 header, hand-built: magic + version is all the check reads before refusing.
    const buf = new ArrayBuffer(MESH_HEADER_BYTES);
    const dv = new DataView(buf);
    for (let i = 0; i < 4; i++) dv.setUint8(i, MESH_MAGIC.charCodeAt(i));
    dv.setUint32(MESH_VERSION_OFFSET, 2, true);
    await expect(decodeMesh(buf)).rejects.toThrow(/version/);
    await expect(decodeMesh(buf)).rejects.toThrow(/build-meshes/);
  });
});
