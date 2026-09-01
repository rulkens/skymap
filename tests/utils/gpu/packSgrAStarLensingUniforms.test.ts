/**
 * SgrAStarLensingUniforms byte-layout guard.
 *
 * The WGSL `SgrAStarLensingUniforms` struct in `shaders/lib/sgrAStarLensing.wesl`
 * and the CPU-side `packSgrAStarLensingUniforms` must agree byte-for-byte: a
 * mismatch produces no GPU error, just a wrong (or, on iOS, silently dropped)
 * frame. This is the `testing.md` keep-rule for uniform layouts — it fails on a
 * real drift no compiler check catches (Task 13's lens pass, not yet written,
 * is the eventual consumer of this contract).
 *
 * Drives the real packer with distinct, non-round values in every slot (no
 * two sentinels equal, so a swapped pair of fields is caught) and reads the
 * returned `Float32Array` at the offsets the struct pins.
 */

import { describe, it, expect } from 'vitest';
import {
  packSgrAStarLensingUniforms,
  SGR_A_STAR_LENSING_UNIFORM_FLOATS,
} from '../../../src/utils/gpu/packSgrAStarLensingUniforms';
import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// A recognisable viewProj: 1..16 so any transposition or off-by-one
// placement of a later field into the matrix block shows up as a wrong value.
const VIEW_PROJ = new Float32Array(16);
for (let i = 0; i < 16; i++) VIEW_PROJ[i] = i + 1;

const VIEWPORT_PX: Vec2 = [1920, 1080];

// Distinct, non-round scalars — dyadic fractions where possible so the
// float32 round-trip is exact and `toBe` needs no tolerance, yet no two
// sentinels are equal (swap-proof).
const SCHWARZSCHILD_RADIUS_M = 12030000128; // ~r_s of Sgr A*, snapped to a float32-exact multiple of 2048
const INNER_RS = 2.5;
const OUTER_RS = 12.5;
const INCLINATION_RAD = 0.9375; // dyadic (15/16) — float32-exact, unlike 0.9625
const POSITION_ANGLE_RAD = 1.1875;
const FLICKER_AMP = 0.34375;
const FLICKER_TIMESCALE_S = 315.5;
const FLICKER_PHASE = 0.71875;
const LUT_MIN_IMPACT_PARAM_RS = 2.09375;
const LUT_MAX_IMPACT_PARAM_RS = 40.5;
const LUT_SAMPLE_COUNT = 256;
const BAND_ALPHA = 0.578125;
const ANCHOR_POS_REL_CAM_M: Vec3 = [3.5, -1.25, 7.75];
// T15 TEMP tuning-knob fields — deleted along with these sentinels at the
// removal step once Task 17 converges.
const DISK_SCALE_HEIGHT_RS = 0.8125;
const EDGE_FADE_START_FRACTION = 0.65625;
const DOPPLER_STRENGTH = 0.46875;
const EMISSION_STRENGTH = 0.90625;
const EDGE_FADE_END_RS = 1875.5;
const EMISSION_TINT: Vec3 = [801, 802, 803];
const QUAD_PLANE_RADIUS_RS = 2343.75;

describe('SgrAStarLensingUniforms byte offsets', () => {
  it('packs a 176-byte / 44-f32 record with each field at its documented offset', () => {
    const rec = packSgrAStarLensingUniforms(
      VIEW_PROJ,
      VIEWPORT_PX,
      SCHWARZSCHILD_RADIUS_M,
      INNER_RS,
      OUTER_RS,
      INCLINATION_RAD,
      POSITION_ANGLE_RAD,
      FLICKER_AMP,
      FLICKER_TIMESCALE_S,
      FLICKER_PHASE,
      LUT_MIN_IMPACT_PARAM_RS,
      LUT_MAX_IMPACT_PARAM_RS,
      LUT_SAMPLE_COUNT,
      BAND_ALPHA,
      ANCHOR_POS_REL_CAM_M,
      DISK_SCALE_HEIGHT_RS,
      EDGE_FADE_START_FRACTION,
      DOPPLER_STRENGTH,
      EMISSION_STRENGTH,
      EDGE_FADE_END_RS,
      EMISSION_TINT,
      QUAD_PLANE_RADIUS_RS,
    );

    expect(rec.length).toBe(SGR_A_STAR_LENSING_UNIFORM_FLOATS);
    expect(rec.length).toBe(44); // 176 bytes
    expect(rec.byteLength).toBe(176);

    // cam.viewProj — all 16 floats verbatim at bytes 0..63.
    for (let i = 0; i < 16; i++) expect(rec[i]).toBe(VIEW_PROJ[i]);

    // cam.viewportPx — vec2 at byte 64 (float index 16).
    expect(rec[16]).toBe(VIEWPORT_PX[0]); // byte 64
    expect(rec[17]).toBe(VIEWPORT_PX[1]); // byte 68

    // cam._pad0/_pad1 — untouched, stay zero.
    expect(rec[18]).toBe(0); // byte 72
    expect(rec[19]).toBe(0); // byte 76

    // Renderer-specific scalars, offset 80+ (float index 20+).
    expect(rec[20]).toBe(SCHWARZSCHILD_RADIUS_M); // byte 80
    expect(rec[21]).toBe(INNER_RS); // byte 84
    expect(rec[22]).toBe(OUTER_RS); // byte 88
    expect(rec[23]).toBe(INCLINATION_RAD); // byte 92
    expect(rec[24]).toBe(POSITION_ANGLE_RAD); // byte 96
    expect(rec[25]).toBe(FLICKER_AMP); // byte 100
    expect(rec[26]).toBe(FLICKER_TIMESCALE_S); // byte 104
    expect(rec[27]).toBe(FLICKER_PHASE); // byte 108
    expect(rec[28]).toBe(LUT_MIN_IMPACT_PARAM_RS); // byte 112
    expect(rec[29]).toBe(LUT_MAX_IMPACT_PARAM_RS); // byte 116
    expect(rec[30]).toBe(LUT_SAMPLE_COUNT); // byte 120
    expect(rec[31]).toBe(BAND_ALPHA); // byte 124

    // anchorPosRelCamM — vec3 at byte 128 (float index 32), 16-byte aligned:
    // the 12 preceding scalars exactly fill the run up to 32, so no implicit
    // padding was inserted ahead of it.
    expect(rec[32]).toBe(ANCHOR_POS_REL_CAM_M[0]); // byte 128
    expect(rec[33]).toBe(ANCHOR_POS_REL_CAM_M[1]); // byte 132
    expect(rec[34]).toBe(ANCHOR_POS_REL_CAM_M[2]); // byte 136

    // T15 TEMP tuning-knob fields, offset 140+ (float index 35+).
    expect(rec[35]).toBe(DISK_SCALE_HEIGHT_RS); // byte 140
    expect(rec[36]).toBe(EDGE_FADE_START_FRACTION); // byte 144
    expect(rec[37]).toBe(DOPPLER_STRENGTH); // byte 148
    expect(rec[38]).toBe(EMISSION_STRENGTH); // byte 152

    // edgeFadeEndRs — per-frame derived escape-fade end (not a T15 knob).
    expect(rec[39]).toBe(EDGE_FADE_END_RS); // byte 156

    // emissionTint — vec3 at byte 160 (float index 40).
    expect(rec[40]).toBe(EMISSION_TINT[0]); // byte 160
    expect(rec[41]).toBe(EMISSION_TINT[1]); // byte 164
    expect(rec[42]).toBe(EMISSION_TINT[2]); // byte 168

    // quadPlaneRadiusRs — per-frame derived billboard half-size (not a knob).
    expect(rec[43]).toBe(QUAD_PLANE_RADIUS_RS); // byte 172
  });
});
