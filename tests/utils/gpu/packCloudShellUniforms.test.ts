/**
 * CloudShellUniforms byte-layout guard.
 *
 * The WGSL `CloudShellUniforms` struct in `shaders/lib/sphere.wesl` and the
 * CPU-side `packCloudShellUniforms` must agree byte-for-byte: a mismatch
 * produces no GPU error, just a wrong (or, on iOS, silently dropped) frame.
 * This is the `testing.md` keep-rule for uniform layouts — it fails on a real
 * drift no compiler check catches.
 *
 * The test drives the real packer with distinct, dyadic values in every slot
 * (exactly representable in float32, so `toBe` is exact) and reads the returned
 * `Float32Array` at the offsets the struct pins. It pins `cloudOpacity` at float
 * index 19 — the slot the lit packer leaves a zeroed pad — so a packer that
 * forgot to overwrite it (and left the lit pad in place) fails, and
 * `sunIrradiance` at float index 20 (the new 16-byte row), so a packer that
 * dropped it fails too.
 */

import { describe, it, expect } from 'vitest';
import {
  packCloudShellUniforms,
  CLOUD_SHELL_UNIFORM_FLOATS,
} from '../../../src/utils/gpu/packCloudShellUniforms';
import { packLitBodyUniforms } from '../../../src/utils/gpu/packLitBodyUniforms';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// A recognisable MVP: 1..16 so any transposition or off-by-one placement of a
// later field into the matrix block shows up as a wrong value.
const MVP = new Float32Array(16);
for (let i = 0; i < 16; i++) MVP[i] = i + 1;

// Distinct, dyadic vectors + scalars so a mis-mapped component perturbs a byte
// the check would catch, and float32 `toBe` is exact (the packer does not
// renormalise).
const SUN_DIR: Vec3 = [0.5, 0.25, 0.75];
const CLOUD_OPACITY = 0.625;
const SUN_IRRADIANCE = 17.25;

describe('CloudShellUniforms byte offsets', () => {
  it('packs a 96-byte / 24-f32 record: cloudOpacity @76, sunIrradiance @80', () => {
    const rec = packCloudShellUniforms(MVP, SUN_DIR, CLOUD_OPACITY, SUN_IRRADIANCE);
    expect(rec.length).toBe(CLOUD_SHELL_UNIFORM_FLOATS);
    expect(rec.length).toBe(24); // 96 bytes
    expect(rec.byteLength).toBe(96);

    // mvp — all 16 floats verbatim at bytes 0..63.
    for (let i = 0; i < 16; i++) expect(rec[i]).toBe(MVP[i]);

    // sunDirLocal — vec3 at byte 64 (float index 16), 16-byte aligned. The lit
    // prefix is reused, so bytes 0..75 match packLitBodyUniforms exactly.
    const lit = packLitBodyUniforms(MVP, SUN_DIR);
    for (let i = 0; i < 19; i++) expect(rec[i]).toBe(lit[i]);
    expect(rec[16]).toBe(SUN_DIR[0]); // byte 64
    expect(rec[17]).toBe(SUN_DIR[1]); // byte 68
    expect(rec[18]).toBe(SUN_DIR[2]); // byte 72

    // cloudOpacity — float index 19 (byte 76), the vec3's trailing slot. A REAL
    // field here (like RingUniforms.planetRadiusRatio), NOT the zeroed pad the
    // lit packer leaves — so this fails if the override was dropped.
    expect(rec[19]).toBe(CLOUD_OPACITY); // byte 76

    // sunIrradiance — float index 20 (byte 80), the new 16-byte row. Fails if the
    // packer dropped it.
    expect(rec[20]).toBe(SUN_IRRADIANCE); // byte 80

    // Trailing pad — floats 21..23 round the struct to 96 bytes and stay zeroed.
    expect(rec[21]).toBe(0); // byte 84
    expect(rec[22]).toBe(0); // byte 88
    expect(rec[23]).toBe(0); // byte 92
  });
});
