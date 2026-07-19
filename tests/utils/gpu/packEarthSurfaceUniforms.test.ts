/**
 * EarthSurfaceUniforms byte-layout guard.
 *
 * The WGSL `EarthSurfaceUniforms` struct in `shaders/lib/sphere.wesl` and the
 * CPU-side `packEarthSurfaceUniforms` must agree byte-for-byte: a mismatch
 * produces no GPU error, just a wrong (or, on iOS, silently dropped) frame.
 * This is the `testing.md` keep-rule for uniform layouts — it fails on a real
 * drift no compiler check catches.
 *
 * The test drives the real packer: it feeds distinct, non-round values into
 * every slot and reads the returned `Float32Array` back at the byte offsets the
 * struct pins. The packer computes those offsets independently of these
 * assertions, so a reordered field or a lost write fails here. In particular it
 * pins `roughnessBase` at float index 19 — the slot the lit packer leaves a
 * zeroed pad — so a packer that forgot to overwrite it (and left the lit pad in
 * place) fails.
 */

import { describe, it, expect } from 'vitest';
import {
  packEarthSurfaceUniforms,
  EARTH_SURFACE_UNIFORM_FLOATS,
} from '../../../src/utils/gpu/packEarthSurfaceUniforms';
import { packLitBodyUniforms } from '../../../src/utils/gpu/packLitBodyUniforms';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// A recognisable MVP: 1..16 so any transposition or off-by-one placement of a
// later field into the matrix block shows up as a wrong value.
const MVP = new Float32Array(16);
for (let i = 0; i < 16; i++) MVP[i] = i + 1;

// Distinct, non-unit vectors so a mis-mapped component perturbs a byte the
// check would catch (the packer does not renormalise).
const SUN_DIR: Vec3 = [0.5, 0.25, 0.75];
const CAM_POS: Vec3 = [-1.5, 2.5, -3.5];
const ROUGHNESS = 0.37;
const F0 = 0.02;
const SUN_IRRADIANCE = 3.14;
const CLOUD_SHADOW = 0.68;

describe('EarthSurfaceUniforms byte offsets', () => {
  it('packs a 112-byte / 28-f32 record with roughnessBase filling the vec3 tail @76', () => {
    const rec = packEarthSurfaceUniforms(
      MVP,
      SUN_DIR,
      CAM_POS,
      ROUGHNESS,
      F0,
      SUN_IRRADIANCE,
      CLOUD_SHADOW,
    );
    expect(rec.length).toBe(EARTH_SURFACE_UNIFORM_FLOATS);
    expect(rec.length).toBe(28); // 112 bytes
    expect(rec.byteLength).toBe(112);

    // mvp — all 16 floats verbatim at bytes 0..63.
    for (let i = 0; i < 16; i++) expect(rec[i]).toBe(MVP[i]);

    // sunDirLocal — vec3 at byte 64 (float index 16), 16-byte aligned. The
    // lit prefix is reused, so bytes 0..75 match packLitBodyUniforms exactly.
    const lit = packLitBodyUniforms(MVP, SUN_DIR);
    for (let i = 0; i < 19; i++) expect(rec[i]).toBe(lit[i]);
    expect(rec[16]).toBe(SUN_DIR[0]); // byte 64
    expect(rec[17]).toBe(SUN_DIR[1]); // byte 68
    expect(rec[18]).toBe(SUN_DIR[2]); // byte 72

    // roughnessBase — float index 19 (byte 76), the vec3's trailing slot. A
    // REAL field here (like RingUniforms.planetRadiusRatio), NOT the zeroed pad
    // the lit packer leaves — so this fails if the override was dropped.
    expect(rec[19]).toBeCloseTo(ROUGHNESS); // byte 76

    // camPosLocal — vec3 at the 16-aligned byte 80 (float index 20). These
    // components are Float32-exact, so plain toBe pins the offsets exactly.
    expect(rec[20]).toBe(CAM_POS[0]); // byte 80
    expect(rec[21]).toBe(CAM_POS[1]); // byte 84
    expect(rec[22]).toBe(CAM_POS[2]); // byte 88

    expect(rec[23]).toBeCloseTo(F0); // byte 92 — fills camPosLocal's vec3 tail
    expect(rec[24]).toBeCloseTo(SUN_IRRADIANCE); // byte 96
    expect(rec[25]).toBeCloseTo(CLOUD_SHADOW); // byte 100

    // Tail pad zeroed (bytes 104..111) — rounds the struct to 112 / 16-byte.
    expect(rec[26]).toBe(0); // byte 104 — _pad0
    expect(rec[27]).toBe(0); // byte 108 — _pad1
  });
});
