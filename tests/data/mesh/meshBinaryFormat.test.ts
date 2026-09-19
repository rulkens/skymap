import { describe, it, expect } from 'vitest';
import {
  decodeMesh,
  MESH_HEADER_BYTES,
  MESH_MAGIC,
  MESH_VERSION_OFFSET,
} from '../../../src/data/mesh/meshBinaryFormat';

/** The 20-byte v2 header, hand-built: all the version check reads before refusing. */
const V2_HEADER_BYTES = 20;

function buildV2Header(): ArrayBuffer {
  const buf = new ArrayBuffer(V2_HEADER_BYTES);
  const dv = new DataView(buf);
  for (let i = 0; i < 4; i++) dv.setUint8(i, MESH_MAGIC.charCodeAt(i));
  dv.setUint32(MESH_VERSION_OFFSET, 2, true);
  return buf;
}

describe('mesh binary format (SKMH v3)', () => {
  it('rejects a bad magic', async () => {
    await expect(decodeMesh(new ArrayBuffer(MESH_HEADER_BYTES))).rejects.toThrow(/magic/);
  });

  it('rejects a v2 file', async () => {
    const buf = buildV2Header();
    await expect(decodeMesh(buf)).rejects.toThrow(/version/);
    await expect(decodeMesh(buf)).rejects.toThrow(/build-meshes/);
  });
});
