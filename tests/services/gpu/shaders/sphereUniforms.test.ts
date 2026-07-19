/**
 * LitBodyUniforms byte-layout guard.
 *
 * The WGSL `struct LitBodyUniforms` in `shaders/lib/sphere.wesl` and the CPU-side
 * `packLitBodyUniforms` must agree byte-for-byte: a mismatch produces no GPU
 * error, just a wrong (or, on iOS, silently dropped) frame. This is the
 * `testing.md` keep-rule for uniform layouts — it fails on a real drift no
 * compiler check catches.
 *
 * The test drives the real packer (not a source-text grep of the shader): it
 * feeds distinct, non-round values into every slot and reads the returned
 * `Float32Array` back at the byte offsets the struct pins. The packer computes
 * those offsets independently of these assertions, so a reordered field or a
 * lost write fails here.
 *
 * `TexturedBodyUniforms` — the sibling that extends this lit prefix — has its own
 * parity guard in `tests/utils/gpu/packTexturedBodyUniforms.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import {
  packLitBodyUniforms,
  LIT_BODY_UNIFORM_FLOATS,
} from '../../../../src/utils/gpu/packLitBodyUniforms';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// A recognisable MVP: 1..16 so any transposition or off-by-one placement of a
// later field into the matrix block shows up as a wrong value.
const MVP = new Float32Array(16);
for (let i = 0; i < 16; i++) MVP[i] = i + 1;

// Distinct, non-unit sun direction so a mis-mapped component perturbs a byte
// the check would catch (not a normalised vector — the packer does not
// renormalise, and using 0.5/0.25/0.75 makes each lane unique).
const SUN_DIR: Vec3 = [0.5, 0.25, 0.75];

describe('LitBodyUniforms byte offsets', () => {
  it('packs mvp + sunDirLocal@64 into an 80-byte / 20-f32 record, tail @76 zeroed', () => {
    const rec = packLitBodyUniforms(MVP, SUN_DIR);
    expect(rec.length).toBe(LIT_BODY_UNIFORM_FLOATS);
    expect(rec.length).toBe(20); // 80 bytes
    expect(rec.byteLength).toBe(80);

    // mvp — all 16 floats verbatim at bytes 0..63.
    for (let i = 0; i < 16; i++) expect(rec[i]).toBe(MVP[i]);

    // sunDirLocal — vec3 at byte 64 (float index 16), 16-byte aligned.
    expect(rec[16]).toBe(SUN_DIR[0]); // byte 64
    expect(rec[17]).toBe(SUN_DIR[1]); // byte 68
    expect(rec[18]).toBe(SUN_DIR[2]); // byte 72

    // byte 76 (float index 19) is the vec3's trailing pad — zeroed. Ambient is
    // NOT carried on the uniform; it lives in bodyLighting.wesl's AMBIENT const.
    expect(rec[19]).toBe(0); // byte 76 — _pad
  });
});
