/**
 * packCloudUniforms — the tool's packer for `milkyWay/sprites/io.wesl`'s
 * 208-byte `Uniforms`. The app's `milkyWayCloudRenderer` packs the same struct
 * from its own copy of the offset table, so the one thing worth pinning here
 * is that the tool's copy still agrees with io.wesl's byte layout: every field
 * at its documented float index, and the two viewports (star pass vs dust
 * pass) landing in the one lane the shader reads for the pixel clamp.
 *
 * The known-lookAt right/up cases stay from the previous 112-byte packer —
 * they cover the stride-4 gather off the view matrix's rotation rows, which is
 * real index arithmetic rather than a restatement.
 */
import { describe, expect, it } from 'vitest';
import { mat4 } from 'wgpu-matrix';
import {
  CLOUD_UNIFORM_FLOATS,
  packCloudUniforms,
} from '../../../../../tools/galaxy-renderer/src/engine/sprites/packCloudUniforms';
import type { MilkyWayTuning } from '../../../../../src/@types/settings/MilkyWayTuning';

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

// A distinguishable view matrix (not a real rotation) purely to check the
// index-picking (view[0], view[4], view[8] / view[1], view[5], view[9]).
const VIEW = new Float32Array([
  100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115,
]);

describe('packCloudUniforms', () => {
  it('output is io.wesl-sized (208 bytes) with viewProj at floats 0-15', () => {
    const out = packCloudUniforms(VIEW_PROJ, VIEW, [800, 600], TUNING);
    expect(out.byteLength).toBe(208);
    expect(out.length).toBe(CLOUD_UNIFORM_FLOATS);
    expect(Array.from(out.slice(0, 16))).toEqual(Array.from(VIEW_PROJ));
  });

  it('viewportPx is the TARGET size the caller passed, at floats 16-17', () => {
    // The star pass draws into the reduced-resolution aggregate and the dust
    // pass draws full-res, so the same packer has to emit two viewports —
    // the lane stars.wesl converts NDC to pixels through before clamping.
    const full = packCloudUniforms(VIEW_PROJ, VIEW, [800, 600], TUNING);
    expect([full[16], full[17]]).toEqual([800, 600]);
    const reduced = packCloudUniforms(VIEW_PROJ, VIEW, [266, 200], TUNING);
    expect([reduced[16], reduced[17]]).toEqual([266, 200]);
  });

  it('model is the identity at floats 20-35', () => {
    const out = packCloudUniforms(VIEW_PROJ, VIEW, [800, 600], TUNING);
    // prettier-ignore
    expect(Array.from(out.slice(20, 36))).toEqual([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
  });

  it('camRight/camUp are the view rotation rows with w=0 (known lookAt)', () => {
    // eye [0,0,10] looking at the origin, world +Y up: the camera basis is
    // axis-aligned, so right/up read off cleanly as [1,0,0] / [0,1,0].
    const view = mat4.lookAt([0, 0, 10], [0, 0, 0], [0, 1, 0]);
    const viewProj = mat4.multiply(mat4.perspective(1, 1, 0.1, 100), view);
    const out = packCloudUniforms(viewProj, view, [800, 600], TUNING);
    expect(out[36]).toBeCloseTo(1, 12);
    expect(out[37]).toBeCloseTo(0, 12);
    expect(out[38]).toBeCloseTo(0, 12);
    expect(out[39]).toBe(0);
    expect(out[40]).toBeCloseTo(0, 12);
    expect(out[41]).toBeCloseTo(1, 12);
    expect(out[42]).toBeCloseTo(0, 12);
    expect(out[43]).toBe(0);
  });

  it('params0/params1 carry the tuning knobs at their io.wesl lanes', () => {
    const out = packCloudUniforms(VIEW_PROJ, VIEW, [800, 600], TUNING);
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
    const out = packCloudUniforms(VIEW_PROJ, VIEW, [800, 600], TUNING, 1, dst);
    expect(out).toBe(dst);
    expect(Array.from(dst).some((v) => v === -7)).toBe(false);
  });
});
