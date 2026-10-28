/**
 * EarthSurfaceUniforms byte-layout guard: the WGSL struct in `shaders/lib/sphere.wesl` and
 * `packEarthSurfaceUniforms` must agree byte-for-byte; a mismatch gives no GPU error, just a wrong (on
 * iOS, silently dropped) frame. Distinct non-round values in every slot are read back at the struct's
 * offsets; `roughnessBase` at float 19 (a zeroed pad in the lit packer) catches a packer that never
 * overwrote it.
 */

import { describe, it, expect } from 'vitest';
import {
  packEarthSurfaceUniforms,
  EARTH_SURFACE_UNIFORM_FLOATS,
} from '../../../../src/layers/body/render/packEarthSurfaceUniforms';
import { packLitBodyUniforms } from '../../../../src/layers/body/render/packLitBodyUniforms';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const MVP = new Float32Array(16);
for (let i = 0; i < 16; i++) MVP[i] = i + 1;

const SUN_DIR: Vec3 = [0.5, 0.25, 0.75];
const CAM_POS: Vec3 = [-1.5, 2.5, -3.5];
const ROUGHNESS = 0.37;
const F0 = 0.02;
const SUN_IRRADIANCE = 3.14;
const CLOUD_SHADOW = 0.68;
const CLOUD_SHELL_RADIUS = 1.03;
// Dyadic, so float32 `toBe` is exact.
const AMBIENT_LIGHT = 0.03125;
const OCEAN_ROUGHNESS = 0.28125;

describe('EarthSurfaceUniforms byte offsets', () => {
  it('packs a 128-byte / 32-f32 record with roughnessBase filling the vec3 tail @76', () => {
    const rec = packEarthSurfaceUniforms(
      MVP,
      SUN_DIR,
      CAM_POS,
      ROUGHNESS,
      F0,
      SUN_IRRADIANCE,
      CLOUD_SHADOW,
      CLOUD_SHELL_RADIUS,
      AMBIENT_LIGHT,
      OCEAN_ROUGHNESS,
    );
    expect(rec.length).toBe(EARTH_SURFACE_UNIFORM_FLOATS);
    expect(rec.length).toBe(32); // 128 bytes
    expect(rec.byteLength).toBe(128);

    for (let i = 0; i < 16; i++) expect(rec[i]).toBe(MVP[i]);

    // sunDirLocal — vec3 at byte 64 (float 16); the lit prefix is reused, so bytes 0..75 match packLitBodyUniforms.
    const lit = packLitBodyUniforms(MVP, SUN_DIR);
    for (let i = 0; i < 19; i++) expect(rec[i]).toBe(lit[i]);
    expect(rec[16]).toBe(SUN_DIR[0]); // byte 64
    expect(rec[17]).toBe(SUN_DIR[1]); // byte 68
    expect(rec[18]).toBe(SUN_DIR[2]); // byte 72

    // roughnessBase — float 19 (byte 76), the vec3's trailing slot: a REAL field, not the zeroed lit pad.
    expect(rec[19]).toBeCloseTo(ROUGHNESS); // byte 76

    // camPosLocal — vec3 at the 16-aligned byte 80; Float32-exact components, so plain toBe.
    expect(rec[20]).toBe(CAM_POS[0]); // byte 80
    expect(rec[21]).toBe(CAM_POS[1]); // byte 84
    expect(rec[22]).toBe(CAM_POS[2]); // byte 88

    expect(rec[23]).toBeCloseTo(F0); // byte 92 — fills camPosLocal's vec3 tail
    expect(rec[24]).toBeCloseTo(SUN_IRRADIANCE); // byte 96
    expect(rec[25]).toBeCloseTo(CLOUD_SHADOW); // byte 100

    // cloudShellRadius — float 26 (byte 104); a dropped 8th arg zeroes the slot.
    expect(rec[26]).toBeCloseTo(CLOUD_SHELL_RADIUS); // byte 104

    // ambientLight — float 27 (byte 108): a REAL field (night-side floor); a dropped 9th arg zeroes it.
    expect(rec[27]).toBe(AMBIENT_LIGHT); // byte 108

    // oceanRoughness — float 28 (byte 112), first slot of the second 16-byte row: a REAL field
    // (open-water GGX roughness); a dropped 10th arg zeroes it.
    expect(rec[28]).toBe(OCEAN_ROUGHNESS); // byte 112

    // Indices 29..31 (bytes 116..127) are true padding.
    expect(rec[29]).toBe(0);
    expect(rec[30]).toBe(0);
    expect(rec[31]).toBe(0);
  });
});
