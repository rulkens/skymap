/**
 * TexturedBodyUniforms byte-layout guard.
 *
 * The WGSL `struct TexturedBodyUniforms` in `shaders/lib/sphere.wesl` and the
 * CPU-side `packTexturedBodyUniforms` must agree byte-for-byte: a mismatch
 * produces no GPU error, just a wrong (or, on iOS, silently dropped) frame — the
 * `CLAUDE.md` layout trap. This is the `testing.md` keep-rule for uniform
 * layouts: it fails on a real drift no compiler check catches.
 *
 * The float indices ARE the contract. The test hand-sets a distinct value in
 * every field and asserts each index directly (NOT a mirror of the packer's own
 * expression), so a reordered field, a lost write, or a size drift fails here.
 * The 80-byte lit prefix is re-derived through `packLitBodyUniforms` and compared
 * slot-for-slot, proving the shared prefix is reused (no drift seam), not copied.
 *
 *   0..15 mvp  16..18 sunDirLocal  19 lit pad  20 ringInnerRatio
 *   21 ringOuterRatio  22 limbStrength  23 limbExponent
 *   24..26 camPosLocal  27 pad
 */

import { describe, it, expect } from 'vitest';
import {
  packTexturedBodyUniforms,
  TEXTURED_BODY_UNIFORM_FLOATS,
} from '../../../src/utils/gpu/packTexturedBodyUniforms';
import { packLitBodyUniforms } from '../../../src/utils/gpu/packLitBodyUniforms';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// A recognisable MVP: 1..16 so any transposition or off-by-one placement of a
// later field into the matrix block shows up as a wrong value.
const MVP = new Float32Array(16);
for (let i = 0; i < 16; i++) MVP[i] = i + 1;

// Distinct, non-unit sun direction so a mis-mapped component perturbs a byte the
// check would catch (the packer does not renormalise).
// Every sentinel is dyadic (k/16 or k/4) — exactly float32-representable, so
// `.toBe` stays exact — and pairwise distinct, so a swapped field is caught.
const SUN_DIR: Vec3 = [0.5, 0.25, 0.75];
const RING_INNER = 1.25; // 20/16
const RING_OUTER = 2.25; // 36/16
const LIMB_STRENGTH = 0.625; // 10/16
const LIMB_EXPONENT = 0.875; // 14/16
// Distinct per-lane camera so a swapped component is caught.
const CAM_LOCAL: Vec3 = [3.5, -4.25, 6.75];

describe('TexturedBodyUniforms byte offsets', () => {
  it('packs the lit prefix, ring ratios, limb fields, and camPosLocal at the fixed indices', () => {
    const out = packTexturedBodyUniforms(
      MVP,
      SUN_DIR,
      RING_INNER,
      RING_OUTER,
      LIMB_STRENGTH,
      LIMB_EXPONENT,
      CAM_LOCAL,
    );
    expect(out).toHaveLength(TEXTURED_BODY_UNIFORM_FLOATS);
    expect(out.length).toBe(28); // 112 bytes
    expect(out.byteLength).toBe(112);

    // The 80-byte lit prefix (mvp + sunDirLocal@64 + pad@76) is identical to what
    // packLitBodyUniforms writes — proves the shared prefix is reused, not
    // re-derived (no drift seam). Includes the zeroed lit pad at index 19.
    const lit = packLitBodyUniforms(MVP, SUN_DIR);
    for (let i = 0; i < 20; i++) expect(out[i]).toBe(lit[i]);
    expect(out[19]).toBe(0); // lit pad — belt-and-braces

    // Ring ratios, limb params, camPosLocal at their pinned offsets.
    expect(out[20]).toBe(RING_INNER); // byte 80
    expect(out[21]).toBe(RING_OUTER); // byte 84
    expect(out[22]).toBe(LIMB_STRENGTH); // byte 88
    expect(out[23]).toBe(LIMB_EXPONENT); // byte 92
    expect([out[24], out[25], out[26]]).toEqual([CAM_LOCAL[0], CAM_LOCAL[1], CAM_LOCAL[2]]); // 96..104

    // Trailing pad zeroed (bytes 108..111) — rounds the struct to 112 / 16-byte.
    expect(out[27]).toBe(0);
  });

  it('defaults to plain Lambert — limbStrength 0 is the identity the absent-row data-gate relies on', () => {
    // A body with no Minnaert row packs strength 0; the limbDarkening factor
    // collapses to 1.0 regardless of exponent, so the body shades as plain
    // Lambert (limb-darkening is data, not a code path).
    const out = packTexturedBodyUniforms(MVP, SUN_DIR, 0, 0, 0, 0, [0, 0, 0]);
    expect(out[22]).toBe(0);
    expect(out[23]).toBe(0);
    expect([out[24], out[25], out[26]]).toEqual([0, 0, 0]);
  });
});
