/**
 * composeOrbitMvp — basis-placement + precision tests.
 *
 * ### Identity-VP case
 *
 * With an identity view-projection the MVP IS the model matrix, so
 * transforming the local ring points must land them at their world-space
 * positions: local (1,0,0) → center − renderOrigin + uAxis·r, local (0,1,0)
 * → center − renderOrigin + vAxis·r. This pins the column layout (uAxis in
 * column 0, vAxis in column 1, translation in column 3) independent of any
 * camera math.
 *
 * ### f64 path (mirrors composeBodyMvp.test's precision structure)
 *
 * Same catastrophic-cancellation regime composeBodyMvp guards, with one
 * honest difference in the achievable bar: a sphere body's model TRANSLATION
 * carries the position and its geometry spans only ±1 radius around it, so
 * compose-then-narrow reaches sub-metre error. An orbit ring's quad spans
 * the full ±1.1·orbitRadius, so evaluating the ring point nearest the camera
 * is inherently a difference of quad-scale values — narrowed at 2^-24
 * relative of the RING RADIUS, not of the view scale. At an Earth-radius
 * zoom on a 1 AU ring that residual is ~1e-3 NDC (well under a pixel); the
 * separate-narrow path is ~5 orders of magnitude worse (hundreds of NDC
 * units — the ring lands entirely off-screen). The assertions use those
 * NDC-relative bars.
 */

import { describe, expect, it } from 'vitest';
import { mat4, mat4d, vec4 } from 'wgpu-matrix';

import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { composeOrbitMvp } from '../../../src/utils/camera/composeOrbitMvp';
import { computeForegroundViewProj } from '../../../src/utils/camera/computeForegroundViewProj';
import { narrowMat4 } from '../../../src/utils/math/narrowMat4';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// ── Shared geometry — an Earth-like 1 AU orbit in a tilted plane ─────────────

const radiusMpc = 1 * SCALE_UNITS.AU_TO_MPC;
const renderOrigin: Vec3 = [0, 0, 0];

// A tilted orthonormal in-plane basis (23.44°-ish about +x) so the test
// exercises the ROTATED columns, not an axis-aligned special case.
const TILT = 0.409; // radians
const uAxis: Vec3 = [1, 0, 0];
const vAxis: Vec3 = [0, Math.cos(TILT), Math.sin(TILT)];
const centerMpc: Vec3 = [0, 0, 0];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('composeOrbitMvp — identity-VP column layout', () => {
  const identityVp = mat4d.identity() as Float64Array;

  function transform(mvp: Float32Array, local: [number, number, number]): Vec3 {
    const clip = vec4.transformMat4([local[0], local[1], local[2], 1], mvp);
    return [clip[0] as number, clip[1] as number, clip[2] as number];
  }

  it('maps local (1,0,0) to center − renderOrigin + uAxis·r', () => {
    // Offset the centre so the translation column is exercised too.
    const offCenter: Vec3 = [3, -2, 5];
    const origin: Vec3 = [1, 1, 1];
    const mvp = composeOrbitMvp(identityVp, offCenter, uAxis, vAxis, 2, origin);
    const p = transform(mvp, [1, 0, 0]);
    expect(p[0]).toBeCloseTo(offCenter[0] - origin[0] + uAxis[0] * 2, 5);
    expect(p[1]).toBeCloseTo(offCenter[1] - origin[1] + uAxis[1] * 2, 5);
    expect(p[2]).toBeCloseTo(offCenter[2] - origin[2] + uAxis[2] * 2, 5);
  });

  it('maps local (0,1,0) to center − renderOrigin + vAxis·r', () => {
    const mvp = composeOrbitMvp(identityVp, centerMpc, uAxis, vAxis, 3, renderOrigin);
    const p = transform(mvp, [0, 1, 0]);
    expect(p[0]).toBeCloseTo(vAxis[0] * 3, 6);
    expect(p[1]).toBeCloseTo(vAxis[1] * 3, 6);
    expect(p[2]).toBeCloseTo(vAxis[2] * 3, 6);
  });

  it('maps local (0,0,1) along u × v (the plane normal) scaled by r', () => {
    const mvp = composeOrbitMvp(identityVp, centerMpc, uAxis, vAxis, 4, renderOrigin);
    const p = transform(mvp, [0, 0, 1]);
    // u × v for the tilted basis above.
    const n: Vec3 = [
      uAxis[1] * vAxis[2] - uAxis[2] * vAxis[1],
      uAxis[2] * vAxis[0] - uAxis[0] * vAxis[2],
      uAxis[0] * vAxis[1] - uAxis[1] * vAxis[0],
    ];
    expect(p[0]).toBeCloseTo(n[0] * 4, 6);
    expect(p[1]).toBeCloseTo(n[1] * 4, 6);
    expect(p[2]).toBeCloseTo(n[2] * 4, 6);
  });
});

// ── Precision: the f64 seam (mirrors composeBodyMvp.test) ───────────────────

// Camera close to the ring's angle-0 point (the body), looking at it — the
// regime where an f32-narrowed VP's translation error swamps the geometry.
function makeVp(bodyMpc: Vec3, viewScaleMpc: number): Float64Array {
  return computeForegroundViewProj({
    eyeMpc: [bodyMpc[0], bodyMpc[1], bodyMpc[2] + 2 * viewScaleMpc],
    targetMpc: bodyMpc,
    up: [0, 1, 0],
    renderOrigin,
    fovYRad: Math.PI / 4,
    aspect: 1,
    near: viewScaleMpc * 0.1,
    far: viewScaleMpc * 100,
  });
}

// f64 ground truth: the same math as composeOrbitMvp without the narrow.
function f64OrbitMvp(vp: Float64Array, center: Vec3, u: Vec3, v: Vec3, r: number): Float64Array {
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const model = mat4d.create() as Float64Array;
  model[0] = u[0] * r;
  model[1] = u[1] * r;
  model[2] = u[2] * r;
  model[4] = v[0] * r;
  model[5] = v[1] * r;
  model[6] = v[2] * r;
  model[8] = n[0] * r;
  model[9] = n[1] * r;
  model[10] = n[2] * r;
  model[12] = center[0] - renderOrigin[0];
  model[13] = center[1] - renderOrigin[1];
  model[14] = center[2] - renderOrigin[2];
  model[15] = 1;
  return mat4d.multiply(vp, model) as Float64Array;
}

// Transform a local point through an f64 MVP → NDC (manual column-major
// multiply; wgpu-matrix's vec4.transformMat4 is f32-typed).
function transformF64ToNdc(mvp: Float64Array, local: [number, number, number, number]): Vec3 {
  const [x, y, z, w] = local;
  const cx = mvp[0]! * x + mvp[4]! * y + mvp[8]! * z + mvp[12]! * w;
  const cy = mvp[1]! * x + mvp[5]! * y + mvp[9]! * z + mvp[13]! * w;
  const cz = mvp[2]! * x + mvp[6]! * y + mvp[10]! * z + mvp[14]! * w;
  const cw = mvp[3]! * x + mvp[7]! * y + mvp[11]! * z + mvp[15]! * w;
  return [cx / cw, cy / cw, cz / cw];
}

function transformF32ToNdc(mvp: Float32Array, local: [number, number, number, number]): Vec3 {
  const clip = vec4.transformMat4(local, mvp);
  const cw = clip[3] as number;
  return [(clip[0] as number) / cw, (clip[1] as number) / cw, (clip[2] as number) / cw];
}

function ndcError(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

describe('composeOrbitMvp — f64 compose-then-narrow precision', () => {
  // The ring's angle-0 point (the body position) in world space.
  const ringPoint: [number, number, number, number] = [1, 0, 0, 1];

  it('a 1 AU orbit viewed at Earth-radius zoom survives compose-then-narrow at sub-pixel error', () => {
    // Body at the ring's angle-0 point; camera frames a ~Earth-radius patch
    // of the ring, the same view scale composeBodyMvp.test uses.
    const viewScale = 6371 * SCALE_UNITS.KM_TO_MPC;
    const bodyMpc: Vec3 = [
      centerMpc[0] + uAxis[0] * radiusMpc,
      centerMpc[1] + uAxis[1] * radiusMpc,
      centerMpc[2] + uAxis[2] * radiusMpc,
    ];
    const vp = makeVp(bodyMpc, viewScale);

    const ndcF32 = transformF32ToNdc(
      composeOrbitMvp(vp, centerMpc, uAxis, vAxis, radiusMpc, renderOrigin),
      ringPoint,
    );
    const ndcF64 = transformF64ToNdc(
      f64OrbitMvp(vp, centerMpc, uAxis, vAxis, radiusMpc),
      ringPoint,
    );

    // Bar: 0.01 NDC (a few px on any real viewport). The residual is the
    // inherent quad-scale f32 evaluation described in the module header —
    // ~2^-24 of the ring radius over the view scale, ~1e-3 NDC here — NOT
    // a compose-path defect; the f64 compose is what keeps it this small.
    expect(ndcError(ndcF32, ndcF64)).toBeLessThan(0.01);
  });

  it('narrowing the VP and model separately loses the ring at parsec scale', () => {
    // Centre the orbit at Proxima's distance — the regime where an f32 VP
    // translation error (~7.8e-14 Mpc) exceeds the view scale by orders of
    // magnitude (same numbers as composeBodyMvp.test's negative case).
    const pcCenter: Vec3 = [1.301 * SCALE_UNITS.PC_TO_MPC, 0, 0];
    const viewScale = 6371 * SCALE_UNITS.KM_TO_MPC;
    const pcBody: Vec3 = [
      pcCenter[0] + uAxis[0] * radiusMpc,
      pcCenter[1] + uAxis[1] * radiusMpc,
      pcCenter[2] + uAxis[2] * radiusMpc,
    ];
    const vp = makeVp(pcBody, viewScale);

    const ndcF64 = transformF64ToNdc(f64OrbitMvp(vp, pcCenter, uAxis, vAxis, radiusMpc), ringPoint);

    // Compose-then-narrow (the implementation) stays sub-pixel — same bar
    // as the positive case, in the harder parsec-centre regime.
    const ndcGood = transformF32ToNdc(
      composeOrbitMvp(vp, pcCenter, uAxis, vAxis, radiusMpc, renderOrigin),
      ringPoint,
    );
    expect(ndcError(ndcGood, ndcF64)).toBeLessThan(0.01);

    // Separate-narrow path: round VP and model to f32 independently, THEN
    // multiply — the cancellation happens after the bits are already gone.
    // The VP translation (~1.3e-6 Mpc) carries a raw f32 rounding error of
    // ~7.8e-14 Mpc ≈ hundreds of view-scales, so the ring lands entirely
    // off-screen: NDC error > 1 (a full half-viewport).
    const vpF32 = narrowMat4(vp);
    // Identity-VP f64OrbitMvp yields the bare model matrix.
    const model64 = f64OrbitMvp(
      mat4d.identity() as Float64Array,
      pcCenter,
      uAxis,
      vAxis,
      radiusMpc,
    );
    const modelF32 = narrowMat4(model64);
    const mvpBad = mat4.multiply(vpF32, modelF32) as Float32Array;
    const ndcBad = transformF32ToNdc(mvpBad, ringPoint);
    expect(ndcError(ndcBad, ndcF64)).toBeGreaterThan(1);
  });
});
