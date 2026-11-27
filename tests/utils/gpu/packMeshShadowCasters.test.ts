/**
 * MeshShadowCasters byte-layout guard: the WGSL struct in `lib/meshShadow.wesl` and the packer
 * must agree byte for byte, and a mismatch only draws a wrong ground shadow. Distinct sentinels
 * at the documented indices; slots and count are i32 words, read back through an integer view.
 */

import { describe, it, expect } from 'vitest';
import { packMeshShadowCasters } from '../../../src/utils/gpu/packMeshShadowCasters';
import type { MeshGroundCaster } from '../../../src/@types/rendering/MeshGroundCaster';

function caster(slot: number): MeshGroundCaster {
  const lightFromEye = new Float32Array(16);
  for (let i = 0; i < 16; i++) lightFromEye[i] = slot * 100 + i;
  return { slot, lightFromEye };
}

describe('MeshShadowCasters byte offsets', () => {
  it('packs each matrix, slot and the count at its documented index, at most four casters', () => {
    const bytes = packMeshShadowCasters([caster(7), caster(3), caster(5), caster(1), caster(6)]);
    expect(bytes.byteLength).toBe(288);
    const floats = new Float32Array(bytes);
    const ints = new Int32Array(bytes);
    [7, 3, 5, 1].forEach((slot, i) => {
      for (let j = 0; j < 16; j++) expect(floats[i * 16 + j]).toBe(slot * 100 + j); // bytes 64i..
    });
    expect([ints[64], ints[65], ints[66], ints[67]]).toEqual([7, 3, 5, 1]); // bytes 256..271
    expect(ints[68]).toBe(4); // byte 272
  });
});
