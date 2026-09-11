/**
 * MeshBodyUniforms byte-layout guard.
 *
 * The WGSL `struct MeshBodyUniforms` and `packMeshBodyUniforms` must agree
 * byte-for-byte: a mismatch raises no GPU error, it just renders a wrong frame
 * (on WebKit, silently drops it). This is the `testing.md` keep-rule for uniform
 * layouts, not a constant restatement.
 *
 * The float indices ARE the contract, so every field gets a distinct dyadic
 * sentinel and is asserted at its documented index — never by re-deriving the
 * packer's own expression. `model` is the trap this pins hardest: a `mat3x3` is
 * three 16-byte columns, so its 9 values land at 20..22 / 24..26 / 28..30 with a
 * dead float between each, and packing it densely would slide every later field.
 */

import { describe, it, expect } from 'vitest';
import { packMeshBodyUniforms } from '../../../src/utils/gpu/packMeshBodyUniforms';
import { MESH_BODY_UNIFORM_FLOATS } from '../../../src/data/mesh/meshBodyUniformLayout';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { Mat3 } from '../../../src/@types/math/Mat3';

const MVP = new Float32Array(16);
for (let i = 0; i < 16; i++) MVP[i] = i + 1;

// Every sentinel is dyadic (exactly float32-representable, so `.toBe` is exact)
// and pairwise distinct, so a swapped or dropped field fails.
const SUN_DIR: Vec3 = [0.5, 0.25, 0.75];
const SUN_VISIBLE = 0.375;
// 101..109, far from the mvp's 1..16, so a column landing inside the matrix
// block is unmistakable.
const MODEL: Mat3 = [101, 102, 103, 104, 105, 106, 107, 108, 109];
const CAM_LOCAL: Vec3 = [3.5, -4.25, 6.75];
const HOST_SHINE_STRENGTH = 0.625;
const HOST_SHINE_COLOUR: Vec3 = [0.125, 0.1875, 0.8125];
const DIR_TO_HOST: Vec3 = [-0.5, 0.25, -0.875];

describe('MeshBodyUniforms byte offsets', () => {
  it('packs every field at its documented float index', () => {
    const out = packMeshBodyUniforms({
      mvp: MVP,
      sunDirLocal: SUN_DIR,
      sunVisibleFraction: SUN_VISIBLE,
      model: MODEL,
      camPosLocal: CAM_LOCAL,
      hostShineStrength: HOST_SHINE_STRENGTH,
      hostShineColor: HOST_SHINE_COLOUR,
      dirToHost: DIR_TO_HOST,
    });

    expect(out).toHaveLength(MESH_BODY_UNIFORM_FLOATS);
    expect(out.byteLength).toBe(176);

    for (let i = 0; i < 16; i++) expect(out[i]).toBe(i + 1); // bytes 0..63

    expect([out[16], out[17], out[18]]).toEqual([0.5, 0.25, 0.75]); // bytes 64..75
    expect(out[19]).toBe(SUN_VISIBLE); // byte 76 — fills sunDirLocal's pad slot

    // mat3x3 columns at bytes 80 / 96 / 112, each with a dead trailing float.
    expect([out[20], out[21], out[22]]).toEqual([101, 102, 103]);
    expect(out[23]).toBe(0);
    expect([out[24], out[25], out[26]]).toEqual([104, 105, 106]);
    expect(out[27]).toBe(0);
    expect([out[28], out[29], out[30]]).toEqual([107, 108, 109]);
    expect(out[31]).toBe(0);

    expect([out[32], out[33], out[34]]).toEqual([3.5, -4.25, 6.75]); // bytes 128..139
    expect(out[35]).toBe(HOST_SHINE_STRENGTH); // byte 140 — camPosLocal's pad slot

    expect([out[36], out[37], out[38]]).toEqual([0.125, 0.1875, 0.8125]); // bytes 144..155
    expect(out[39]).toBe(0); // byte 156 — _pad0

    expect([out[40], out[41], out[42]]).toEqual([-0.5, 0.25, -0.875]); // bytes 160..171
    expect(out[43]).toBe(0); // byte 172 — _pad1, rounding the struct to 176
  });

  it('reads only the first 16 floats of a longer mvp', () => {
    // `composeBodySlabMvp` narrows from f64 and may hand over a longer scratch
    // buffer; a `set(mvp)` without the subarray would overrun into sunDirLocal.
    const long = new Float32Array(20);
    for (let i = 0; i < 20; i++) long[i] = i + 1;
    const out = packMeshBodyUniforms({
      mvp: long,
      sunDirLocal: SUN_DIR,
      sunVisibleFraction: SUN_VISIBLE,
      model: MODEL,
      camPosLocal: CAM_LOCAL,
      hostShineStrength: HOST_SHINE_STRENGTH,
      hostShineColor: HOST_SHINE_COLOUR,
      dirToHost: DIR_TO_HOST,
    });
    expect([out[16], out[17], out[18]]).toEqual([0.5, 0.25, 0.75]);
  });
});
