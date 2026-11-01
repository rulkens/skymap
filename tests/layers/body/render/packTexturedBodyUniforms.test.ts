/**
 * TexturedBodyUniforms byte-layout guard: the WGSL `struct TexturedBodyUniforms` in
 * `shaders/lib/sphere.wesl` and `packTexturedBodyUniforms` must agree byte-for-byte; a mismatch gives no
 * GPU error, just a wrong (on iOS, silently dropped) frame. The float indices ARE the contract,
 * asserted directly (NOT mirrored from the packer); the 80-byte lit prefix is compared slot-for-slot
 * with `packLitBodyUniforms`.
 *
 *   0..15 mvp  16..18 sunDirLocal  19 lit pad  20 ringInnerRatio
 *   21 ringOuterRatio  22 limbStrength  23 limbExponent
 *   24..26 camPosLocal  27 camAltitudeSq  28..43 vpCamRelLocal
 */

import { describe, it, expect } from 'vitest';
import {
  packTexturedBodyUniforms,
  TEXTURED_BODY_UNIFORM_FLOATS,
} from '../../../../src/layers/body/render/packTexturedBodyUniforms';
import { packLitBodyUniforms } from '../../../../src/layers/body/render/packLitBodyUniforms';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const MVP = new Float32Array(16);
for (let i = 0; i < 16; i++) MVP[i] = i + 1;

// Sentinels are dyadic (k/16 or k/4), float32-exact so `.toBe` stays exact, and pairwise distinct.
const SUN_DIR: Vec3 = [0.5, 0.25, 0.75];
const RING_INNER = 1.25; // 20/16
const RING_OUTER = 2.25; // 36/16
const LIMB_STRENGTH = 0.625; // 10/16
const LIMB_EXPONENT = 0.875; // 14/16
const CAM_LOCAL: Vec3 = [3.5, -4.25, 6.75];
const CAM_ALTITUDE_SQ = 0.375; // 6/16
// 101..116, so no entry collides with the mvp's 1..16.
const CAM_REL_VP = new Float32Array(16);
for (let i = 0; i < 16; i++) CAM_REL_VP[i] = 101 + i;

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
      CAM_ALTITUDE_SQ,
      CAM_REL_VP,
    );
    expect(out).toHaveLength(TEXTURED_BODY_UNIFORM_FLOATS);
    expect(out.length).toBe(44); // 176 bytes
    expect(out.byteLength).toBe(176);

    // The 80-byte lit prefix is identical to packLitBodyUniforms, including the zeroed pad at 19.
    const lit = packLitBodyUniforms(MVP, SUN_DIR);
    for (let i = 0; i < 20; i++) expect(out[i]).toBe(lit[i]);
    expect(out[19]).toBe(0); // lit pad — belt-and-braces

    expect(out[20]).toBe(RING_INNER); // byte 80
    expect(out[21]).toBe(RING_OUTER); // byte 84
    expect(out[22]).toBe(LIMB_STRENGTH); // byte 88
    expect(out[23]).toBe(LIMB_EXPONENT); // byte 92
    expect([out[24], out[25], out[26]]).toEqual([CAM_LOCAL[0], CAM_LOCAL[1], CAM_LOCAL[2]]); // 96..104

    // camAltitudeSq at byte 108; the eye-relative vp occupies bytes 112..175.
    expect(out[27]).toBe(CAM_ALTITUDE_SQ);
    for (let i = 0; i < 16; i++) expect(out[28 + i]).toBe(CAM_REL_VP[i]);
  });

  it('defaults to plain Lambert — limbStrength 0 is the identity the absent-row data-gate relies on', () => {
    // No Minnaert row packs strength 0: limb darkening collapses to 1.0 (plain Lambert), data not a code path.
    const out = packTexturedBodyUniforms(MVP, SUN_DIR, 0, 0, 0, 0, [0, 0, 0], 0, CAM_REL_VP);
    expect(out[22]).toBe(0);
    expect(out[23]).toBe(0);
    expect([out[24], out[25], out[26]]).toEqual([0, 0, 0]);
  });
});
