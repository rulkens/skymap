/**
 * composeBodyMvp — precision + model-compose tests.
 *
 * ### Positive case
 *
 * Confirms that composing the full proj·view·model in f64 before narrowing
 * keeps the surface-point position error well under one metre for Earth at
 * 1 AU (~4.8e-12 Mpc). The f64 ground truth is the same math as
 * composeBodyMvp but without the final narrowMat4 call.
 *
 * ### Negative case (parsec scale)
 *
 * Proves that narrowing the VP and model matrices separately before multiplying
 * causes positional error > one Earth radius at Proxima's distance (~1.3 pc).
 * At 1 AU the VP translation is ~4.85e-12 Mpc and its f32 absolute error is
 * ~2.9e-19 Mpc — 1400× smaller than a body radius, so 1 AU cannot trigger
 * the cancellation. At 1.3 pc the VP translation is ~1.3e-6 Mpc; its f32
 * error grows to ~7.76e-14 Mpc (~376 body radii). The test asserts that
 * composeBodyMvp's f64-before-narrow path stays under one body radius while
 * the separate-narrow f32 path exceeds it.
 *
 * Both precision cases compare clip-space positions converted to NDC (÷ w).
 *
 * ### Orientation + oblateness cases
 *
 * The rotation round-trip proves `orientation` is embedded as the model's `R`
 * factor (a transposed embed would land the surface vertex at the wrong NDC).
 * The oblateness cases prove the polar (model-Z) axis scales by `1 − oblateness`
 * INSIDE the oriented frame — a tilted oblate body flattens along its OWN pole,
 * not world-Z.
 */

import { describe, expect, it } from 'vitest';
import { mat4, mat4d, vec4 } from 'wgpu-matrix';

import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { RENDER_ORIGIN_MPC } from '../../../src/data/renderOrigin';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { composeBodyMvp } from '../../../src/utils/camera/composeBodyMvp';
import { computeForegroundViewProj } from '../../../src/utils/camera/computeForegroundViewProj';
import { IDENTITY_MAT3 } from '../../../src/utils/math/identityMat3';
import { narrowMat4 } from '../../../src/utils/math/narrowMat4';

// ── Shared test geometry ──────────────────────────────────────────────────────

const radiusMpc = 6371 * SCALE_UNITS.KM_TO_MPC;

// Earth at 1 AU along the +X axis.
const bodyPosMpc: [number, number, number] = [1 * SCALE_UNITS.AU_TO_MPC, 0, 0];

// Render origin is the Sun (0,0,0).
const renderOrigin: [number, number, number] = [
  RENDER_ORIGIN_MPC[0] as number,
  RENDER_ORIGIN_MPC[1] as number,
  RENDER_ORIGIN_MPC[2] as number,
];

// Camera sits ~2 Earth-radii above the body along +Z, looking at the body.
const eyeMpc: [number, number, number] = [
  bodyPosMpc[0] as number,
  bodyPosMpc[1] as number,
  (bodyPosMpc[2] as number) + 2 * radiusMpc,
];
const targetMpc: [number, number, number] = [
  bodyPosMpc[0] as number,
  bodyPosMpc[1] as number,
  bodyPosMpc[2] as number,
];
const up: [number, number, number] = [0, 1, 0];

// Frustum chosen so the body fills the view.
const near = radiusMpc * 0.1;
const far = radiusMpc * 100;
const fovYRad = Math.PI / 4;
const aspect = 1;

// Build the f64 foreground view-projection matrix.
const foregroundVp = computeForegroundViewProj({
  eyeMpc,
  targetMpc,
  up,
  renderOrigin,
  fovYRad,
  aspect,
  near,
  far,
  reversedZ: false,
});

// The surface vertex: unit-sphere +X face in body-local space.
const localVertex: [number, number, number, number] = [1, 0, 0, 1];

// ── f64 ground truth ──────────────────────────────────────────────────────────
// Same math as composeBodyMvp but without the final narrowMat4 — pure f64.

function f64Mvp(): Float64Array {
  const delta: [number, number, number] = [
    (bodyPosMpc[0] as number) - (renderOrigin[0] as number),
    (bodyPosMpc[1] as number) - (renderOrigin[1] as number),
    (bodyPosMpc[2] as number) - (renderOrigin[2] as number),
  ];
  const model = mat4d.multiply(
    mat4d.translation(delta),
    mat4d.scaling([radiusMpc, radiusMpc, radiusMpc]),
  ) as Float64Array;
  return mat4d.multiply(foregroundVp, model) as Float64Array;
}

// Transform [1,0,0,1] through a f64 MVP and return NDC [x/w, y/w, z/w].
// Manual column-major mat4 × vec4 multiply — no wgpu-matrix vec4.transformMat4
// for the f64 path since that function operates on f32 typed arrays.
function transformF64ToNdc(mvp: Float64Array): [number, number, number] {
  const x = localVertex[0] as number;
  const y = localVertex[1] as number;
  const z = localVertex[2] as number;
  const w = localVertex[3] as number;
  const cx =
    (mvp[0] as number) * x +
    (mvp[4] as number) * y +
    (mvp[8] as number) * z +
    (mvp[12] as number) * w;
  const cy =
    (mvp[1] as number) * x +
    (mvp[5] as number) * y +
    (mvp[9] as number) * z +
    (mvp[13] as number) * w;
  const cz =
    (mvp[2] as number) * x +
    (mvp[6] as number) * y +
    (mvp[10] as number) * z +
    (mvp[14] as number) * w;
  const cw =
    (mvp[3] as number) * x +
    (mvp[7] as number) * y +
    (mvp[11] as number) * z +
    (mvp[15] as number) * w;
  return [cx / cw, cy / cw, cz / cw];
}

// Transform [1,0,0,1] through a narrowed f32 MVP and return NDC.
function transformF32ToNdc(mvp: Float32Array): [number, number, number] {
  const clip = vec4.transformMat4(localVertex, mvp);
  const cw = clip[3] as number;
  return [(clip[0] as number) / cw, (clip[1] as number) / cw, (clip[2] as number) / cw];
}

// Euclidean distance between two NDC triples.
// The NDC cube is [-1,1]^3 and the body fills roughly the full frustum
// (fovY = π/4, eye at 2×radiusMpc), so ~1 NDC unit ≈ 1 radiusMpc.
// Multiplying by radiusMpc converts NDC distance to Mpc.
function ndcErrorMpc(a: [number, number, number], b: [number, number, number]): number {
  const dx = (a[0] as number) - (b[0] as number);
  const dy = (a[1] as number) - (b[1] as number);
  const dz = (a[2] as number) - (b[2] as number);
  return Math.sqrt(dx * dx + dy * dy + dz * dz) * radiusMpc;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('composeBodyMvp', () => {
  it('an Earth-radius body at 1 AU survives compose-then-narrow with sub-metre error', () => {
    // Compose-before-narrow path (the implementation under test). composeBodyMvp
    // itself returns f64; narrowMat4 here stands in for the GPU-drawing caller's
    // own upload-site narrow (see composeBodyMvp's header).
    const mvpF32 = narrowMat4(
      composeBodyMvp(foregroundVp, bodyPosMpc, renderOrigin, radiusMpc, IDENTITY_MAT3),
    );
    const ndcF32 = transformF32ToNdc(mvpF32);

    // Pure-f64 ground truth.
    const ndcF64 = transformF64ToNdc(f64Mvp());

    // Tolerance: 1e-3 km in Mpc — well under one metre.
    const toleranceMpc = 1e-3 * SCALE_UNITS.KM_TO_MPC;
    const errorMpc = ndcErrorMpc(ndcF32, ndcF64);

    console.log(
      `[positive] NDC error in Mpc: ${errorMpc.toExponential(4)} ` +
        `(tolerance: ${toleranceMpc.toExponential(4)} Mpc)`,
    );

    expect(errorMpc).toBeLessThan(toleranceMpc);
  });

  it('narrowing foregroundVp and model separately blows past the body radius at parsec scale', () => {
    // ── Why parsec scale (not 1 AU) triggers catastrophic cancellation ─────────
    //
    // f32 has a 24-bit mantissa, giving relative error ~5.96e-8 per stored value.
    // At 1 AU from the origin (bodyPosMpc_AU ≈ 4.85e-12 Mpc), the VP translation
    // is also ~4.85e-12 Mpc, so its f32 absolute error is ~2.9e-19 Mpc — roughly
    // 1400× smaller than one Earth radius (~2.07e-16 Mpc). The separate-narrow
    // path does NOT exceed a body radius there.
    //
    // At Proxima's distance (~1.301 pc ≈ 1.301e-6 Mpc), the VP translation is
    // ~1.3e-6 Mpc. Its f32 absolute error is ~7.76e-14 Mpc — about 376× larger
    // than one Earth radius. The separate-narrow path accumulates this error as a
    // positional offset in clip space, swamping the body's actual size.
    //
    // f64 at 1.3 pc: absolute error ~1.44e-22 Mpc ≈ 7e-7 body radii — safe by
    // six orders of magnitude. composeBodyMvp composes in f64, so it survives.
    // The separate-narrow f32 path fails here by design: it cannot distinguish
    // the body from its own rounding error.

    // ── Parsec-scale geometry ─────────────────────────────────────────────────

    const pcBodyPosMpc: [number, number, number] = [1.301 * SCALE_UNITS.PC_TO_MPC, 0, 0];
    const pcRenderOrigin: [number, number, number] = [
      RENDER_ORIGIN_MPC[0] as number,
      RENDER_ORIGIN_MPC[1] as number,
      RENDER_ORIGIN_MPC[2] as number,
    ];

    // Camera sits ~2 body-radii from the body along +Z, looking at it.
    const pcEyeMpc: [number, number, number] = [pcBodyPosMpc[0] as number, 0, 2 * radiusMpc];
    const pcTargetMpc: [number, number, number] = [pcBodyPosMpc[0] as number, 0, 0];

    const pcForegroundVp = computeForegroundViewProj({
      eyeMpc: pcEyeMpc,
      targetMpc: pcTargetMpc,
      up: [0, 1, 0],
      renderOrigin: pcRenderOrigin,
      fovYRad: Math.PI / 4,
      aspect: 1,
      near: radiusMpc * 0.1,
      far: radiusMpc * 100,
      reversedZ: false,
    });

    // ── f64 ground truth at parsec scale ──────────────────────────────────────
    // Same math as composeBodyMvp: compose the full MVP in f64 before narrowing.

    const pcDelta: [number, number, number] = [
      (pcBodyPosMpc[0] as number) - (pcRenderOrigin[0] as number),
      (pcBodyPosMpc[1] as number) - (pcRenderOrigin[1] as number),
      (pcBodyPosMpc[2] as number) - (pcRenderOrigin[2] as number),
    ];
    const pcModel64 = mat4d.multiply(
      mat4d.translation(pcDelta),
      mat4d.scaling([radiusMpc, radiusMpc, radiusMpc]),
    ) as Float64Array;
    const pcMvp64 = mat4d.multiply(pcForegroundVp, pcModel64) as Float64Array;
    const ndcF64 = transformF64ToNdc(pcMvp64);

    // ── Assertion 1: composeBodyMvp (f64 compose then narrow) survives ────────
    // Error should be comfortably below one body radius.

    const mvpF32Good = narrowMat4(
      composeBodyMvp(pcForegroundVp, pcBodyPosMpc, pcRenderOrigin, radiusMpc, IDENTITY_MAT3),
    );
    const ndcGood = transformF32ToNdc(mvpF32Good);
    const errorGoodMpc = ndcErrorMpc(ndcGood, ndcF64);

    console.log(
      `[negative/f64] NDC error in Mpc: ${errorGoodMpc.toExponential(4)} ` +
        `(radiusMpc: ${radiusMpc.toExponential(4)})`,
    );

    expect(errorGoodMpc).toBeLessThan(radiusMpc);

    // ── Assertion 2: separate-narrow path blows past one body radius ──────────
    // Narrow foregroundVp to f32 first, then build and narrow the model
    // separately. The VP's ~1.3e-6 Mpc translation carries a raw f32 rounding
    // error of ~7.76e-14 Mpc (~376 Earth radii). That positional offset throws
    // the projected sphere centre far off-screen, so the measured ndcErrorMpc
    // (NDC distance × radiusMpc) cleanly exceeds one radiusMpc.

    const vpF32 = narrowMat4(pcForegroundVp);

    const pcModel64Sep = mat4d.multiply(
      mat4d.translation(pcDelta),
      mat4d.scaling([radiusMpc, radiusMpc, radiusMpc]),
    ) as Float64Array;
    const modelF32 = narrowMat4(pcModel64Sep);

    // Multiply two f32 matrices: both VP and model are independently rounded.
    const mvpF32Bad = mat4.multiply(vpF32, modelF32) as Float32Array;
    const ndcBad = transformF32ToNdc(mvpF32Bad);
    const errorBadMpc = ndcErrorMpc(ndcBad, ndcF64);

    console.log(
      `[negative/f32-sep] NDC error in Mpc: ${errorBadMpc.toExponential(4)} ` +
        `(radiusMpc: ${radiusMpc.toExponential(4)}) ` +
        `= ${(errorBadMpc / radiusMpc).toExponential(2)} body radii`,
    );

    expect(errorBadMpc).toBeGreaterThan(radiusMpc);
  });

  // ── Rotation round-trip ─────────────────────────────────────────────────────
  //
  // NOT a mirror test. The util embeds `orientation` as the model's R factor and
  // returns the narrowed MVP; the test forward-projects the INDEPENDENTLY-rotated
  // world surface point through the same VP (standard clip→NDC pipeline) and
  // asserts the util's MVP lands the body-local vertex at the same NDC. A
  // transposed embed would rotate by −90° (local +x → world −y), landing the
  // vertex at a different NDC — so a pass proves the columns are placed right.

  it('with a non-identity orientation projects the rotated surface direction', () => {
    const rotRenderOrigin: Vec3 = [0, 0, 0];
    const rotBodyPos: Vec3 = [0.5, 0, 0];
    const rotRadiusMpc = 0.3;

    // A concrete f64 VP, built independently of the util: perspective · lookAt,
    // camera 5 units in front of the body along +Z.
    const rotVp = mat4d.multiply(
      mat4d.perspective(Math.PI / 4, 1, 0.1, 100),
      mat4d.lookAt([0.5, 0, 5], rotBodyPos, [0, 1, 0]),
    ) as Float64Array;

    // +90° about +z (column-major, m[c*3+r]): image of local +x is world +y,
    // image of local +y is world −x.
    const rot90z: Mat3 = [0, 1, 0, -1, 0, 0, 0, 0, 1];

    const mvp = narrowMat4(
      composeBodyMvp(rotVp, rotBodyPos, rotRenderOrigin, rotRadiusMpc, rot90z),
    );
    const actualNdc = transformF32ToNdc(mvp);

    // Independent expectation: rotate local +x into world +y, scale by the radius,
    // translate to the body centre → world surface point. Project through the VP
    // via the standard column-major pipeline (renderOrigin is [0,0,0]).
    const worldSurface: Vec3 = [
      rotBodyPos[0] + rotRadiusMpc * 0,
      rotBodyPos[1] + rotRadiusMpc * 1,
      rotBodyPos[2] + rotRadiusMpc * 0,
    ];
    const cx =
      rotVp[0]! * worldSurface[0] +
      rotVp[4]! * worldSurface[1] +
      rotVp[8]! * worldSurface[2] +
      rotVp[12]!;
    const cy =
      rotVp[1]! * worldSurface[0] +
      rotVp[5]! * worldSurface[1] +
      rotVp[9]! * worldSurface[2] +
      rotVp[13]!;
    const cz =
      rotVp[2]! * worldSurface[0] +
      rotVp[6]! * worldSurface[1] +
      rotVp[10]! * worldSurface[2] +
      rotVp[14]!;
    const cw =
      rotVp[3]! * worldSurface[0] +
      rotVp[7]! * worldSurface[1] +
      rotVp[11]! * worldSurface[2] +
      rotVp[15]!;
    const expectedNdc: [number, number, number] = [cx / cw, cy / cw, cz / cw];

    expect(actualNdc[0]).toBeCloseTo(expectedNdc[0], 5);
    expect(actualNdc[1]).toBeCloseTo(expectedNdc[1], 5);
    expect(actualNdc[2]).toBeCloseTo(expectedNdc[2], 5);
  });

  it('with IDENTITY_MAT3 matches the pre-rotation MVP', () => {
    // Regression that the star-sphere path (identity orientation) is unchanged:
    // embedding the identity R must be an exact no-op versus a plain T·S model.
    // The reference builds T·S with NO rotation factor at all — the impl embeds
    // and multiplies by identity R — so this proves the embed doesn't corrupt.
    const delta: [number, number, number] = [
      (bodyPosMpc[0] as number) - (renderOrigin[0] as number),
      (bodyPosMpc[1] as number) - (renderOrigin[1] as number),
      (bodyPosMpc[2] as number) - (renderOrigin[2] as number),
    ];
    const modelTS = mat4d.multiply(
      mat4d.translation(delta),
      mat4d.scaling([radiusMpc, radiusMpc, radiusMpc]),
    ) as Float64Array;
    const referenceMvp = narrowMat4(mat4d.multiply(foregroundVp, modelTS) as Float64Array);

    const actualMvp = narrowMat4(
      composeBodyMvp(foregroundVp, bodyPosMpc, renderOrigin, radiusMpc, IDENTITY_MAT3),
    );

    for (let i = 0; i < 16; i++) {
      expect(actualMvp[i]).toBeCloseTo(referenceMvp[i] as number, 6);
    }
  });

  it('oblate body flattens the polar axis (model-Z) to (1 − oblateness) of the equatorial radius', () => {
    // Drive the per-axis scale path in isolation: an identity VP with the render
    // origin AT the body centre collapses the MVP to the model matrix alone
    // (scale · translate(0)), so a transformed unit point reads the per-axis
    // scale directly — no perspective distortion to unpick. A clean unit radius
    // keeps the ratio (the property under test) scale-independent and f32-exact.
    // Identity orientation keeps the pole on model-Z so the axis-aligned reads hold.
    const r = 1;
    const centre: [number, number, number] = [0, 0, 0];
    const identityVp = mat4d.identity() as Float64Array;

    const oblateMvp = composeBodyMvp(identityVp, centre, centre, r, IDENTITY_MAT3, 0.5);
    const sphereMvp = composeBodyMvp(identityVp, centre, centre, r, IDENTITY_MAT3);

    // +X is an equatorial point, +Z the polar point (the polar-Z simplification
    // composeBodyMvp documents). Compare the transformed extents, not the compose
    // maths: for oblateness 0.5 the polar extent must be exactly half the
    // equatorial extent, and the spherical control must keep the two equal.
    const oblateEquator = vec4.transformMat4([1, 0, 0, 1], oblateMvp)[0] as number;
    const oblatePolar = vec4.transformMat4([0, 0, 1, 1], oblateMvp)[2] as number;
    expect(oblatePolar / oblateEquator).toBeCloseTo(0.5, 6);

    const sphereEquator = vec4.transformMat4([1, 0, 0, 1], sphereMvp)[0] as number;
    const spherePolar = vec4.transformMat4([0, 0, 1, 1], sphereMvp)[2] as number;
    expect(spherePolar / sphereEquator).toBeCloseTo(1, 6);
  });

  it('a tilted oblate body flattens along its OWN pole, not world-Z', () => {
    // Render origin AT the body centre + identity VP collapse the MVP to the
    // model (T(0)·R·S), so a transformed local point reads R·S·v directly.
    // Rotate the body 90° about X so its pole (local +Z) tilts to world −Y.
    // The flatten lives in S (the innermost factor), so the pole EXTENT stays
    // radius·(1 − oblateness) regardless of the tilt — a world-Z flatten
    // (S outside R) would instead leave the tilted pole at full radius and
    // shorten world-Z. Asserting the tilted-pole extent is the shortened one
    // discriminates the two composes; a rotation preserves length, so the read
    // is the flatten alone.
    const centre: [number, number, number] = [0, 0, 0];
    const identityVp = mat4d.identity() as Float64Array;
    // +90° about +x (column-major, m[c*3+r]): local +z → world −y.
    const rotX90: Mat3 = [1, 0, 0, 0, 0, 1, 0, -1, 0];

    const mvp = composeBodyMvp(identityVp, centre, centre, 1, rotX90, 0.5);

    const pole = vec4.transformMat4([0, 0, 1, 1], mvp);
    const poleLen = Math.hypot(pole[0] as number, pole[1] as number, pole[2] as number);
    expect(poleLen).toBeCloseTo(0.5, 6);

    const equator = vec4.transformMat4([1, 0, 0, 1], mvp);
    const equatorLen = Math.hypot(equator[0] as number, equator[1] as number, equator[2] as number);
    expect(equatorLen).toBeCloseTo(1, 6);
  });
});
