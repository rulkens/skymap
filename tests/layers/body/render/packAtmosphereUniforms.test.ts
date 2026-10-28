/**
 * AtmosphereUniforms byte-layout guard: the WGSL struct in `shaders/lib/sphere.wesl` and
 * `packAtmosphereUniforms` must agree byte-for-byte; a mismatch gives no GPU error, just a wrong (on
 * iOS, silently dropped) frame. Distinct non-round values in every slot catch swapped fields;
 * `bottomRadius` at float 19 (a zeroed pad in the lit packer) catches a packer that never overwrote it.
 */

import { describe, it, expect } from 'vitest';
import {
  packAtmosphereUniforms,
  ATMOSPHERE_UNIFORM_FLOATS,
} from '../../../../src/layers/body/render/packAtmosphereUniforms';
import { packLitBodyUniforms } from '../../../../src/layers/body/render/packLitBodyUniforms';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const MVP = new Float32Array(16);
for (let i = 0; i < 16; i++) MVP[i] = i + 1;

const INV_MVP = new Float32Array(16);
for (let i = 0; i < 16; i++) INV_MVP[i] = i + 17;

// Distinct dyadic fractions: exactly representable in float32, so `toBe` stays exact, and no two
// sentinels are equal (swap-proof).
const SUN_DIR: Vec3 = [0.5, 0.25, 0.75];
const CAM_POS: Vec3 = [1.5, 2.5, 3.5];
const BOTTOM_RADIUS = 0.96875; // planetRadiusKm / atmosphereTopKm ∈ (0,1)
const EXPOSURE = 0.625;
const RING_INNER = 1.203125; // ring inner / atmosphere top (> 1: outside the shell)
const RING_OUTER = 2.28125; // ring outer / atmosphere top
const FROXEL_SLICE_KM = 3.5625; // aerial froxel slice depth, km

describe('AtmosphereUniforms byte offsets', () => {
  it('packs a 176-byte / 44-f32 record with invMvp at offset 112', () => {
    const rec = packAtmosphereUniforms(
      MVP,
      INV_MVP,
      SUN_DIR,
      CAM_POS,
      BOTTOM_RADIUS,
      EXPOSURE,
      RING_INNER,
      RING_OUTER,
      FROXEL_SLICE_KM,
    );
    expect(rec.length).toBe(ATMOSPHERE_UNIFORM_FLOATS);
    expect(rec.length).toBe(44); // 176 bytes
    expect(rec.byteLength).toBe(176);

    for (let i = 0; i < 16; i++) expect(rec[i]).toBe(MVP[i]);

    // sunDirLocal — vec3 at byte 64 (float 16); the lit prefix is reused, so floats 0..18 match packLitBodyUniforms.
    const lit = packLitBodyUniforms(MVP, SUN_DIR);
    for (let i = 0; i < 19; i++) expect(rec[i]).toBe(lit[i]);
    expect(rec[16]).toBe(SUN_DIR[0]); // byte 64
    expect(rec[17]).toBe(SUN_DIR[1]); // byte 68
    expect(rec[18]).toBe(SUN_DIR[2]); // byte 72

    // bottomRadius — float 19 (byte 76), the vec3's trailing slot: a REAL field, not the zeroed lit pad.
    expect(rec[19]).toBe(BOTTOM_RADIUS); // byte 76

    expect(rec[20]).toBe(CAM_POS[0]); // byte 80
    expect(rec[21]).toBe(CAM_POS[1]); // byte 84
    expect(rec[22]).toBe(CAM_POS[2]); // byte 88

    // the vec3 tail pad (structural, not content)
    expect(rec[23]).toBe(0); // byte 92
    expect(rec[24]).toBe(EXPOSURE); // byte 96

    // Ring ratios in atmosphere-top units (0 = no ring), for the shell's ring-in-front occlusion.
    expect(rec[25]).toBe(RING_INNER); // byte 100
    expect(rec[26]).toBe(RING_OUTER); // byte 104

    // froxelSliceKm — a real field in the slot that rounds the prefix to 112.
    expect(rec[27]).toBe(FROXEL_SLICE_KM); // byte 108

    for (let i = 0; i < 16; i++) expect(rec[28 + i]).toBe(INV_MVP[i]);
  });
});
