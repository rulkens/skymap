/**
 * packCloudUniforms — the tool's packer for `milkyWay/sprites/io.wesl`'s
 * 208-byte `Uniforms`. The app's `milkyWayCloudRenderer` packs the same struct
 * from its own copy of the offset table, so the one thing worth pinning here
 * is that the tool's copy still agrees with io.wesl's byte layout: every field
 * at its documented float index, and the two viewports (star pass vs dust
 * pass) landing in the one lane the shader reads for the pixel clamp.
 */
import { describe, expect, it } from 'vitest';
import {
  CLOUD_UNIFORM_FLOATS,
  packCloudUniforms,
} from '../../../../../tools/galaxy-renderer/src/engine/sprites/packCloudUniforms';
import type { MilkyWayTuning } from '../../../../../src/@types/settings/MilkyWayTuning';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const TUNING: MilkyWayTuning = {
  starSizeScale: 1.5,
  exposure: 2.25,
  starPxMin: 0.75,
  starPxMax: 33,
  softness: 0.6,
  lodApparent: 0.5,
  // Neither of these reaches the uniform buffer — the divisor sizes the
  // aggregate target and the count carves the layouts — so they are here only
  // to satisfy the type, and deliberately hold values no lane would match.
  aggregateDivisor: 3,
  starCount: 123456,
};

// A distinguishable 4x4 so the floats-0-15 verbatim copy is unambiguous.
const VIEW_PROJ = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

// A distinguishable eye so its three lanes can't be confused with any other.
const EYE: Vec3 = [100, 101, 102];

describe('packCloudUniforms', () => {
  it('output is io.wesl-sized (208 bytes) with viewProj at floats 0-15', () => {
    const out = packCloudUniforms(VIEW_PROJ, EYE, [800, 600], 1000, TUNING);
    expect(out.byteLength).toBe(208);
    expect(out.length).toBe(CLOUD_UNIFORM_FLOATS);
    expect(Array.from(out.slice(0, 16))).toEqual(Array.from(VIEW_PROJ));
  });

  it('viewportPx is the TARGET size the caller passed, at floats 16-17', () => {
    // The star pass draws into the reduced-resolution aggregate and the dust
    // pass draws full-res, so the same packer has to emit two viewports —
    // the lane stars.wesl converts NDC to pixels through before clamping.
    const full = packCloudUniforms(VIEW_PROJ, EYE, [800, 600], 1000, TUNING);
    expect([full[16], full[17]]).toEqual([800, 600]);
    const reduced = packCloudUniforms(VIEW_PROJ, EYE, [266, 200], 1000, TUNING);
    expect([reduced[16], reduced[17]]).toEqual([266, 200]);
  });

  it('model is the identity at floats 20-35', () => {
    const out = packCloudUniforms(VIEW_PROJ, EYE, [800, 600], 1000, TUNING);
    // prettier-ignore
    expect(Array.from(out.slice(20, 36))).toEqual([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
  });

  it('camPosModel occupies floats 36-38, and the reserved slot stays zero', () => {
    // The shader builds each sprite's basis from this point, so a lane shifted
    // into the reserved slot would tilt every blob toward the origin instead.
    const out = packCloudUniforms(VIEW_PROJ, EYE, [800, 600], 1000, TUNING);
    expect(Array.from(out.slice(36, 44))).toEqual([100, 101, 102, 0, 0, 0, 0, 0]);
  });

  it('params0/params1 carry the tuning knobs at their io.wesl lanes', () => {
    const out = packCloudUniforms(VIEW_PROJ, EYE, [800, 600], 1000, TUNING);
    // params0 = (fadeAlpha, exposure, modelScale, softness). The tool has no
    // scene placement, so lane z is pinned 1; lane x defaults to 1 when no
    // visibility fade is supplied.
    expect(out[44]).toBe(1);
    expect(out[45]).toBeCloseTo(TUNING.exposure, 6);
    expect(out[46]).toBe(1);
    expect(out[47]).toBeCloseTo(TUNING.softness, 6);
    // params1 = (starPxMin, starPxMax, starSizeScale, lodApparent).
    expect(out[48]).toBeCloseTo(TUNING.starPxMin, 6);
    expect(out[49]).toBeCloseTo(TUNING.starPxMax, 6);
    expect(out[50]).toBeCloseTo(TUNING.starSizeScale, 6);
    expect(out[51]).toBeCloseTo(TUNING.lodApparent, 6);
  });

  it('rewrites every lane of a reused dst, pads included', () => {
    // The frame loop hands the same scratch to both passes every frame, so a
    // lane left unwritten would silently carry the other pass's value.
    const dst = new Float32Array(CLOUD_UNIFORM_FLOATS).fill(-7);
    const out = packCloudUniforms(VIEW_PROJ, EYE, [800, 600], 1000, TUNING, 1, dst);
    expect(out).toBe(dst);
    expect(Array.from(dst).some((v) => v === -7)).toBe(false);
  });
});
