/**
 * CloudShellUniforms byte-layout guard: the WGSL struct in `shaders/lib/sphere.wesl` and
 * `packCloudShellUniforms` must agree byte-for-byte; a mismatch gives no GPU error, just a wrong (on
 * iOS, silently dropped) frame. Dyadic values (exact in float32) fill every slot; `cloudOpacity` at
 * float 19 (a zeroed pad in the lit packer) and `sunIrradiance` at float 20 catch a packer that
 * dropped either.
 */

import { describe, it, expect } from 'vitest';
import {
  packCloudShellUniforms,
  CLOUD_SHELL_UNIFORM_FLOATS,
} from '../../../../src/layers/body/render/packCloudShellUniforms';
import { packLitBodyUniforms } from '../../../../src/layers/body/render/packLitBodyUniforms';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const MVP = new Float32Array(16);
for (let i = 0; i < 16; i++) MVP[i] = i + 1;

// Distinct dyadic values: a mis-mapped component is caught and float32 `toBe` is exact.
const SUN_DIR: Vec3 = [0.5, 0.25, 0.75];
const CLOUD_OPACITY = 0.625;
const SUN_IRRADIANCE = 17.25;
const AMBIENT_LIGHT = 0.1875; // dyadic + distinct from every other sentinel

describe('CloudShellUniforms byte offsets', () => {
  it('packs a 96-byte / 24-f32 record: cloudOpacity @76, sunIrradiance @80, ambientLight @84', () => {
    const rec = packCloudShellUniforms(MVP, SUN_DIR, CLOUD_OPACITY, SUN_IRRADIANCE, AMBIENT_LIGHT);
    expect(rec.length).toBe(CLOUD_SHELL_UNIFORM_FLOATS);
    expect(rec.length).toBe(24); // 96 bytes
    expect(rec.byteLength).toBe(96);

    for (let i = 0; i < 16; i++) expect(rec[i]).toBe(MVP[i]);

    // sunDirLocal — vec3 at byte 64 (float index 16), 16-byte aligned. The lit
    // prefix is reused, so bytes 0..75 match packLitBodyUniforms exactly.
    const lit = packLitBodyUniforms(MVP, SUN_DIR);
    for (let i = 0; i < 19; i++) expect(rec[i]).toBe(lit[i]);
    expect(rec[16]).toBe(SUN_DIR[0]); // byte 64
    expect(rec[17]).toBe(SUN_DIR[1]); // byte 68
    expect(rec[18]).toBe(SUN_DIR[2]); // byte 72

    // cloudOpacity — float 19 (byte 76), the vec3's trailing slot: a REAL field, not the zeroed lit pad.
    expect(rec[19]).toBe(CLOUD_OPACITY); // byte 76

    expect(rec[20]).toBe(SUN_IRRADIANCE); // byte 80

    // ambientLight — float 21 (byte 84), the first trailing pad of the row: a REAL field (night-side floor).
    expect(rec[21]).toBe(AMBIENT_LIGHT); // byte 84

    // Trailing pad — floats 22..23 round the struct to 96 bytes and stay zeroed.
    expect(rec[22]).toBe(0); // byte 88
    expect(rec[23]).toBe(0); // byte 92
  });
});
