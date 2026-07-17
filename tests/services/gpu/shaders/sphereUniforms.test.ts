/**
 * LitBodyUniforms / TexturedBodyUniforms byte-layout guard.
 *
 * The WGSL structs in `shaders/lib/sphere.wesl` and the CPU-side packers in
 * `utils/gpu/pack{Lit,Textured}BodyUniforms.ts` must agree byte-for-byte: a
 * mismatch produces no GPU error, just a wrong (or, on iOS, silently dropped)
 * frame. This is the `testing.md` keep-rule for uniform layouts — it fails on a
 * real drift no compiler check catches.
 *
 * The test drives the real packers (not a source-text grep of the shader): it
 * feeds distinct, non-round values into every slot and reads the returned
 * `Float32Array` back at the byte offsets the struct pins. The packers compute
 * those offsets independently of these assertions, so a reordered field or a
 * lost write fails here.
 */

import { describe, it, expect } from 'vitest';
import {
  packLitBodyUniforms,
  LIT_BODY_UNIFORM_FLOATS,
} from '../../../../src/utils/gpu/packLitBodyUniforms';
import {
  packTexturedBodyUniforms,
  TEXTURED_BODY_UNIFORM_FLOATS,
} from '../../../../src/utils/gpu/packTexturedBodyUniforms';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// A recognisable MVP: 1..16 so any transposition or off-by-one placement of a
// later field into the matrix block shows up as a wrong value.
const MVP = new Float32Array(16);
for (let i = 0; i < 16; i++) MVP[i] = i + 1;

// Distinct, non-unit sun direction so a mis-mapped component perturbs a byte
// the check would catch (not a normalised vector — the packer does not
// renormalise, and using 0.5/0.25/0.75 makes each lane unique).
const SUN_DIR: Vec3 = [0.5, 0.25, 0.75];
const AMBIENT = 0.08;
const RING_INNER = 1.24;
const RING_OUTER = 2.27;

describe('LitBodyUniforms byte offsets', () => {
  it('packs mvp, sunDirLocal@64, ambient@76 into an 80-byte / 20-f32 record', () => {
    const rec = packLitBodyUniforms(MVP, SUN_DIR, AMBIENT);
    expect(rec.length).toBe(LIT_BODY_UNIFORM_FLOATS);
    expect(rec.length).toBe(20); // 80 bytes
    expect(rec.byteLength).toBe(80);

    // mvp — all 16 floats verbatim at bytes 0..63.
    for (let i = 0; i < 16; i++) expect(rec[i]).toBe(MVP[i]);

    // sunDirLocal — vec3 at byte 64 (float index 16), 16-byte aligned.
    expect(rec[16]).toBe(SUN_DIR[0]); // byte 64
    expect(rec[17]).toBe(SUN_DIR[1]); // byte 68
    expect(rec[18]).toBe(SUN_DIR[2]); // byte 72

    // ambient — folds into the vec4 tail at byte 76 (float index 19).
    expect(rec[19]).toBeCloseTo(AMBIENT); // byte 76
  });
});

describe('TexturedBodyUniforms byte offsets', () => {
  it('extends the lit prefix with ringInnerRatio@80, ringOuterRatio@84 into a 96-byte / 24-f32 record', () => {
    const rec = packTexturedBodyUniforms(MVP, SUN_DIR, AMBIENT, RING_INNER, RING_OUTER);
    expect(rec.length).toBe(TEXTURED_BODY_UNIFORM_FLOATS);
    expect(rec.length).toBe(24); // 96 bytes
    expect(rec.byteLength).toBe(96);

    // The 80-byte lit prefix is identical to what packLitBodyUniforms writes —
    // proves the shared prefix is reused, not re-derived (no drift seam).
    const lit = packLitBodyUniforms(MVP, SUN_DIR, AMBIENT);
    for (let i = 0; i < 20; i++) expect(rec[i]).toBe(lit[i]);

    // Ring ratios at their pinned offsets.
    expect(rec[20]).toBeCloseTo(RING_INNER); // byte 80
    expect(rec[21]).toBeCloseTo(RING_OUTER); // byte 84

    // Tail pad zeroed (bytes 88..95).
    expect(rec[22]).toBe(0);
    expect(rec[23]).toBe(0);
  });

  it('defaults to no ring — ringOuterRatio 0 is the "no ring" sentinel', () => {
    // A non-ringed body packs zeros; the fragment short-circuits on
    // ringOuterRatio == 0 (ring presence is data, not a Saturn-only branch).
    const rec = packTexturedBodyUniforms(MVP, SUN_DIR, AMBIENT, 0, 0);
    expect(rec[20]).toBe(0);
    expect(rec[21]).toBe(0);
  });
});
