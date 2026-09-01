/**
 * AtmosphereUniforms byte-layout guard.
 *
 * The WGSL `AtmosphereUniforms` struct in `shaders/lib/sphere.wesl` and the
 * CPU-side `packAtmosphereUniforms` must agree byte-for-byte: a mismatch
 * produces no GPU error, just a wrong (or, on iOS, silently dropped) frame.
 * This is the `testing.md` keep-rule for uniform layouts — it fails on a real
 * drift no compiler check catches.
 *
 * The test drives the real packer with distinct, non-round values in every
 * slot (no two sentinels equal, so a swapped pair of fields is caught) and
 * reads the returned `Float32Array` at the offsets the struct pins. In
 * particular it pins `bottomRadius` at float index 19 — the slot the lit packer
 * leaves a zeroed pad — so a packer that forgot to overwrite it (and left the
 * lit pad in place) fails.
 */

import { describe, it, expect } from 'vitest';
import {
  packAtmosphereUniforms,
  ATMOSPHERE_UNIFORM_FLOATS,
} from '../../../src/utils/gpu/packAtmosphereUniforms';
import { packLitBodyUniforms } from '../../../src/utils/gpu/packLitBodyUniforms';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// A recognisable MVP: 1..16 so any transposition or off-by-one placement of a
// later field into the matrix block shows up as a wrong value.
const MVP = new Float32Array(16);
for (let i = 0; i < 16; i++) MVP[i] = i + 1;

// A second recognisable matrix — 17..32, distinct from MVP's 1..16 — so a
// swap between the two 16-float blocks is caught.
const INV_MVP = new Float32Array(16);
for (let i = 0; i < 16; i++) INV_MVP[i] = i + 17;

// Distinct, non-unit vectors + scalars so a mis-mapped component perturbs a
// byte the check would catch, and no two sentinels are equal (swap-proof).
// Dyadic fractions — exactly representable in float32, so `toBe` stays exact
// (swap-proof) rather than needing a tolerance, yet no two sentinels are equal.
const SUN_DIR: Vec3 = [0.5, 0.25, 0.75];
const CAM_POS: Vec3 = [1.5, 2.5, 3.5];
const BOTTOM_RADIUS = 0.96875; // planetRadiusKm / atmosphereTopKm ∈ (0,1)
const EXPOSURE = 0.625;
const RING_INNER = 1.203125; // ring inner / atmosphere top (> 1: outside the shell)
const RING_OUTER = 2.28125; // ring outer / atmosphere top

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
    );
    expect(rec.length).toBe(ATMOSPHERE_UNIFORM_FLOATS);
    expect(rec.length).toBe(44); // 176 bytes
    expect(rec.byteLength).toBe(176);

    // mvp — all 16 floats verbatim at bytes 0..63.
    for (let i = 0; i < 16; i++) expect(rec[i]).toBe(MVP[i]);

    // sunDirLocal — vec3 at byte 64 (float index 16). The lit prefix is reused,
    // so bytes 0..75 (float 0..18) match packLitBodyUniforms exactly.
    const lit = packLitBodyUniforms(MVP, SUN_DIR);
    for (let i = 0; i < 19; i++) expect(rec[i]).toBe(lit[i]);
    expect(rec[16]).toBe(SUN_DIR[0]); // byte 64
    expect(rec[17]).toBe(SUN_DIR[1]); // byte 68
    expect(rec[18]).toBe(SUN_DIR[2]); // byte 72

    // bottomRadius — float index 19 (byte 76), the vec3's trailing slot. A REAL
    // field here (like RingUniforms.planetRadiusRatio), NOT the zeroed pad the
    // lit packer leaves — so this fails if the override was dropped.
    expect(rec[19]).toBe(BOTTOM_RADIUS); // byte 76

    // camPosLocal — vec3 at byte 80 (float index 20), 16-byte aligned.
    expect(rec[20]).toBe(CAM_POS[0]); // byte 80
    expect(rec[21]).toBe(CAM_POS[1]); // byte 84
    expect(rec[22]).toBe(CAM_POS[2]); // byte 88

    // the vec3 tail pad — was sunIrradiance, structural not content
    expect(rec[23]).toBe(0); // byte 92
    expect(rec[24]).toBe(EXPOSURE); // byte 96

    // Ring ratios — the host's ring annulus in atmosphere-top units (0 = no
    // ring), for the shell's ring-in-front occlusion.
    expect(rec[25]).toBe(RING_INNER); // byte 100
    expect(rec[26]).toBe(RING_OUTER); // byte 104

    // Trailing pad zeroed — rounds the struct to 112 / 16-byte alignment.
    expect(rec[27]).toBe(0); // byte 108

    // invMvp — all 16 floats verbatim at bytes 112..175, distinct from MVP's
    // sentinel so a swap of the two matrix blocks is caught.
    for (let i = 0; i < 16; i++) expect(rec[28 + i]).toBe(INV_MVP[i]);
  });
});
