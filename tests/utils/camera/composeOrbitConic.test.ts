/**
 * composeOrbitConic — round-trip back-projection properties.
 *
 * These are NOT mirror tests. The util composes the pixel→plane inverse
 * homography `Ginv`; the test forward-projects known orbit points through the
 * INDEPENDENT standard pipeline (clip = VP·[P−origin;1] → NDC → viewport pixel)
 * and asserts that feeding those pixels back through `Ginv` recovers the plane
 * coordinates the geometry says they should have. Because the forward path is
 * the ordinary projection (not the inverse under test), a pass proves the
 * composed homography actually inverts the projection — a real round-trip.
 *
 * The three fixtures pin the design's structural facts (spec §3.1): the orbit
 * is the unit circle in `(s, t)` about the centre `C` with basis `(A, B)`, so
 *   - `C + A` (periapsis)      → plane (1, 0), in front of camera (q.z > 0),
 *   - `C + B` (E = 90°)        → plane (0, 1),
 *   - `C + 2A` (off-ellipse)   → plane (2, 0), i.e. s²+t² = 4 > 1 (outside).
 */

import { describe, expect, it } from 'vitest';
import { mat4d } from 'wgpu-matrix';

import { composeOrbitConic } from '../../../src/utils/camera/composeOrbitConic';
import { SCENE_ORBIT_CONICS } from '../../../src/data/bodies/sceneOrbitConics';
import { RENDER_ORIGIN_MPC } from '../../../src/data/renderOrigin';
import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// ── Shared fixture: a tilted ellipse viewed by a plain perspective camera ────

const renderOrigin: Vec3 = [0, 0, 0];
const C: Vec3 = [2, 1, 0.5]; // ellipse centre
const A: Vec3 = [1.5, 0, 0]; // semi-major (world)
const B: Vec3 = [0, 1.2, 0.3]; // semi-minor (world, tilted out of a cardinal plane)
const viewportPx: Vec2 = [800, 600];

// A concrete f64 view-projection, built independently of the util:
// VP = perspective · lookAt (the ordinary camera pipeline).
const VP = mat4d.multiply(
  mat4d.perspective(Math.PI / 4, viewportPx[0] / viewportPx[1], 0.1, 100),
  mat4d.lookAt([2, 1, 6], C, [0, 1, 0]),
) as Float64Array;

// Forward-project a world point to a backing-store pixel via the STANDARD
// pipeline — deliberately not the function under test.
function projectToPixel(P: Vec3): Vec2 {
  const x = P[0] - renderOrigin[0];
  const y = P[1] - renderOrigin[1];
  const z = P[2] - renderOrigin[2];
  const cx = VP[0]! * x + VP[4]! * y + VP[8]! * z + VP[12]!;
  const cy = VP[1]! * x + VP[5]! * y + VP[9]! * z + VP[13]!;
  const cw = VP[3]! * x + VP[7]! * y + VP[11]! * z + VP[15]!;
  const ndcX = cx / cw;
  const ndcY = cy / cw;
  // NDC → pixel: x maps [-1,1]→[0,W]; y flips (NDC-up → pixel-down).
  return [(ndcX * 0.5 + 0.5) * viewportPx[0], (0.5 - 0.5 * ndcY) * viewportPx[1]];
}

// q = Ginv · (px, py, 1) on the 12-element padded mat3 (cols at 0,4,8).
function backProject(px: number, py: number): Vec3 {
  const { ginv: Ginv } = composeOrbitConic(VP, C, A, B, viewportPx, renderOrigin);
  const qx = Ginv[0]! * px + Ginv[4]! * py + Ginv[8]!;
  const qy = Ginv[1]! * px + Ginv[5]! * py + Ginv[9]!;
  const qz = Ginv[2]! * px + Ginv[6]! * py + Ginv[10]!;
  return [qx, qy, qz];
}

function plane(P: Vec3): { s: number; t: number; qz: number } {
  const [px, py] = projectToPixel(P);
  const [qx, qy, qz] = backProject(px, py);
  return { s: qx / qz, t: qy / qz, qz };
}

describe('composeOrbitConic', () => {
  it('back-projects the periapsis (C + A) to plane (1, 0), in front of camera', () => {
    const { s, t, qz } = plane([C[0] + A[0], C[1] + A[1], C[2] + A[2]]);
    expect(s).toBeCloseTo(1, 5);
    expect(t).toBeCloseTo(0, 5);
    expect(qz).toBeGreaterThan(0); // q.z = 1/clip-w > 0 ⇒ point is in front
  });

  it('back-projects the E = 90° point (C + B) to plane (0, 1)', () => {
    const { s, t } = plane([C[0] + B[0], C[1] + B[1], C[2] + B[2]]);
    expect(s).toBeCloseTo(0, 5);
    expect(t).toBeCloseTo(1, 5);
  });

  it('places an off-ellipse point (C + 2A) outside the unit circle', () => {
    const { s, t } = plane([C[0] + 2 * A[0], C[1] + 2 * A[1], C[2] + 2 * A[2]]);
    expect(s).toBeCloseTo(2, 5);
    expect(t).toBeCloseTo(0, 5);
    expect(s * s + t * t).toBeGreaterThan(1); // outside ⇒ conic value f > 0
  });
});

// ── The gradient-minor hoist: numerical regression at the Earth-zoom edge-on
//    pose (the speckle bug) ──────────────────────────────────────────────────
//
// This is the numerical heart of the speckle fix. At Earth-surface zoom the
// camera sits essentially ON Earth's orbit plane, so the plane→pixel homography
// G is near-singular — condition number ~1e16. The fragment's antialiasing needs
// the pixel gradient of the plane coordinates s = q.x/q.z, t = q.y/q.z. Written
// the obvious way each gradient numerator is a difference of two products —
// e.g. ds/dpx ∝ ginv[0].x·q.z − q.x·ginv[0].z — whose top-degree px term cancels
// IDENTICALLY, leaving an affine 2×2-minor coefficient. Exact in real arithmetic;
// in f32 the two products are NEARLY EQUAL and cancel catastrophically, so the
// tiny true result keeps almost none of f32's significant digits. Crucially the
// loss is set by the CONDITION NUMBER, not the entry magnitudes: the OLD path
// below is fed the SAME rescaled O(1) ginv the shader reads (G0..G10 off
// composeOrbitConic's output, products ~O(1), NOT ~1e30) and is STILL grossly
// wrong (~54% below) — which is exactly why rescaling alone did not cure the
// speckle and the minor hoist was needed. composeOrbitConic hoists the exactly-
// cancelling numerators to CPU f64 as the minors and hands the fragment the
// affine forms.
//
// The test builds an INDEPENDENT f64 reference homography (its own inverse of
// G = V·H), then over a grid of on-band pixels compares three evaluations of the
// pixel gradient magnitude |grad r| — the quantity that feeds the stroke
// distance and thus the coverage discard:
//   - reference: full f64,
//   - OLD path:  f32 difference-of-products (what shipped, the speckle),
//   - NEW path:  f32 affine minors from composeOrbitConic (the fix).
// Both f32 paths share the SAME f32 q, s, t, r, invZ2 (as the real fragment
// does), so any error separation between them is due ONLY to the gradient form.
// It asserts three things: (1) q/s/t/r ARE well-conditioned at this pose (the
// fragment header's claim), so the bug is isolated to the gradient; (2) the OLD
// difference-of-products |grad r| is grossly wrong (the bite); (3) the NEW
// minor path tracks the f64 reference. A regression to the difference-of-
// products form — or a wrong minor sign/scale in composeOrbitConic — fails (3).

describe('composeOrbitConic — gradient-minor hoist at the edge-on Earth pose', () => {
  const fr = Math.fround;
  const fmul = (a: number, b: number) => fr(a * b);
  const fadd = (a: number, b: number) => fr(a + b);
  const fsub = (a: number, b: number) => fr(a - b);
  const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

  function cross(a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function unit(a: Vec3): Vec3 {
    const L = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / L, a[1] / L, a[2] / L];
  }

  it('OLD difference-of-products |grad r| is grossly wrong while the NEW minor path tracks f64', () => {
    // Earth's real conic, from the element-derived scene table.
    const earth = SCENE_ORBIT_CONICS.find((c) => c.id === 'earth')!;
    const Cw = earth.centerMpc;
    const Aw = earth.semiMajorMpc;
    const Bw = earth.semiMinorMpc;
    const viewport: Vec2 = [1280, 720];

    // Edge-on Earth-zoom pose: camera 1e-15 Mpc (~a few Earth radii) from a
    // point ON the orbit, looking almost tangentially along the orbit with a
    // tiny 0.05-rad out-of-plane tilt. In-plane basis: N ⟂ plane, Q along B.
    const N = unit(cross(Aw, Bw));
    const Q = unit([Bw[0], Bw[1], Bw[2]]);
    const target: Vec3 = [Cw[0] + Aw[0], Cw[1] + Aw[1], Cw[2] + Aw[2]];
    const tilt = 0.05;
    const dir = unit([Q[0] + tilt * N[0], Q[1] + tilt * N[1], Q[2] + tilt * N[2]]);
    const viewLen = 1e-15;
    const eye: Vec3 = [
      target[0] - viewLen * dir[0],
      target[1] - viewLen * dir[1],
      target[2] - viewLen * dir[2],
    ];
    const magA = Math.hypot(Aw[0], Aw[1], Aw[2]);
    const vpF64 = mat4d.multiply(
      mat4d.perspective(Math.PI / 4, viewport[0] / viewport[1], 0.1 * viewLen, 100 * magA),
      mat4d.lookAt(eye, target, N),
    ) as Float64Array;

    const { ginv, minorS, minorT } = composeOrbitConic(
      vpF64,
      Cw,
      Aw,
      Bw,
      viewport,
      RENDER_ORIGIN_MPC,
    );

    // Independent f64 reference: build G = V·H and invert it in double
    // precision by hand (a different route than composeOrbitConic's mat3d
    // inverse — this is the oracle, not a mirror). Gi[row][col].
    const clip = (v: Readonly<Vec3>, w: number): [number, number, number] => [
      vpF64[0]! * v[0] + vpF64[4]! * v[1] + vpF64[8]! * v[2] + vpF64[12]! * w,
      vpF64[1]! * v[0] + vpF64[5]! * v[1] + vpF64[9]! * v[2] + vpF64[13]! * w,
      vpF64[3]! * v[0] + vpF64[7]! * v[1] + vpF64[11]! * v[2] + vpF64[15]! * w,
    ];
    const cRel: Vec3 = [
      Cw[0] - RENDER_ORIGIN_MPC[0],
      Cw[1] - RENDER_ORIGIN_MPC[1],
      Cw[2] - RENDER_ORIGIN_MPC[2],
    ];
    const cols = [clip(Aw, 0), clip(Bw, 0), clip(cRel, 1)];
    const halfW = 0.5 * viewport[0];
    const halfH = 0.5 * viewport[1];
    // G = V·H (V is the same NDC→pixel transform composeOrbitConic uses).
    const G: number[][] = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (let col = 0; col < 3; col++) {
      const hx = cols[col]![0];
      const hy = cols[col]![1];
      const hw = cols[col]![2];
      G[0]![col] = halfW * hx + halfW * hw;
      G[1]![col] = -halfH * hy + halfH * hw;
      G[2]![col] = hw;
    }
    const det =
      G[0]![0]! * (G[1]![1]! * G[2]![2]! - G[1]![2]! * G[2]![1]!) -
      G[0]![1]! * (G[1]![0]! * G[2]![2]! - G[1]![2]! * G[2]![0]!) +
      G[0]![2]! * (G[1]![0]! * G[2]![1]! - G[1]![1]! * G[2]![0]!);
    const Gi: number[][] = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const r1 = (j + 1) % 3;
        const r2 = (j + 2) % 3;
        const c1 = (i + 1) % 3;
        const c2 = (i + 2) % 3;
        Gi[i]![j] = (G[r1]![c1]! * G[r2]![c2]! - G[r1]![c2]! * G[r2]![c1]!) / det;
      }
    }
    // g(col, row) matches the WESL ginv[col].row access.
    const g = (col: number, row: number) => Gi[row]![col]!;

    // The rescaled f32 Ginv the shader actually reads, at its real indices.
    const G0 = ginv[0]!;
    const G1 = ginv[1]!;
    const G2 = ginv[2]!;
    const G4 = ginv[4]!;
    const G5 = ginv[5]!;
    const G6 = ginv[6]!;
    const G8 = ginv[8]!;
    const G9 = ginv[9]!;
    const G10 = ginv[10]!;
    const M1 = minorS[0]!;
    const M2 = minorS[1]!;
    const M3 = minorS[2]!;
    const M4 = minorT[0]!;
    const M5 = minorT[1]!;
    const M6 = minorT[2]!;

    let maxStrErr = 0; // s, t, r accuracy (shared by both paths)
    let maxOldErr = 0; // OLD difference-of-products |grad r| error
    let maxNewErr = 0; // NEW affine-minor |grad r| error
    let bandSamples = 0;

    for (let iy = 0; iy < 180; iy++) {
      for (let ix = 0; ix < 320; ix++) {
        const px = ((ix + 0.5) / 320) * viewport[0];
        const py = ((iy + 0.5) / 180) * viewport[1];

        // Reference f64 back-projection + gradient.
        const qxr = g(0, 0) * px + g(1, 0) * py + g(2, 0);
        const qyr = g(0, 1) * px + g(1, 1) * py + g(2, 1);
        const qzr = g(0, 2) * px + g(1, 2) * py + g(2, 2);
        if (qzr <= 0) continue;
        const izr = 1 / (qzr * qzr);
        const sr = qxr / qzr;
        const tr = qyr / qzr;
        const rr = Math.hypot(sr, tr);
        if (rr < 0.7 || rr > 1.4) continue; // on the orbit band only
        bandSamples++;
        const dsx = (g(0, 0) * qzr - qxr * g(0, 2)) * izr;
        const dsy = (g(1, 0) * qzr - qxr * g(1, 2)) * izr;
        const dtx = (g(0, 1) * qzr - qyr * g(0, 2)) * izr;
        const dty = (g(1, 1) * qzr - qyr * g(1, 2)) * izr;
        const refGrad = Math.hypot((sr * dsx + tr * dtx) / rr, (sr * dsy + tr * dty) / rr);

        // Shared f32 back-projection (both paths use these, as the fragment does).
        const pxf = fr(px);
        const pyf = fr(py);
        const qx = fadd(fadd(fmul(G0, pxf), fmul(G4, pyf)), G8);
        const qy = fadd(fadd(fmul(G1, pxf), fmul(G5, pyf)), G9);
        const qz = fadd(fadd(fmul(G2, pxf), fmul(G6, pyf)), G10);
        if (qz <= 0) continue;
        const sf = fr(qx / qz);
        const tf = fr(qy / qz);
        const rf = fr(Math.hypot(sf, tf));
        const izf = fr(1 / fmul(qz, qz));
        maxStrErr = Math.max(maxStrErr, rel(sf, sr), rel(tf, tr), rel(rf, rr));

        // OLD path — the shipped difference-of-products form.
        const osx = fmul(fsub(fmul(G0, qz), fmul(qx, G2)), izf);
        const osy = fmul(fsub(fmul(G4, qz), fmul(qx, G6)), izf);
        const otx = fmul(fsub(fmul(G1, qz), fmul(qy, G2)), izf);
        const oty = fmul(fsub(fmul(G5, qz), fmul(qy, G6)), izf);
        const oldGrad = fr(
          Math.hypot(
            fr(fadd(fmul(sf, osx), fmul(tf, otx)) / rf),
            fr(fadd(fmul(sf, osy), fmul(tf, oty)) / rf),
          ),
        );
        maxOldErr = Math.max(maxOldErr, rel(oldGrad, refGrad));

        // NEW path — the affine minors (the exact form the fragment now uses).
        const nsx = fmul(fadd(fmul(M1, pyf), M2), izf);
        const nsy = fmul(fadd(fmul(fr(-M1), pxf), M3), izf);
        const ntx = fmul(fadd(fmul(M4, pyf), M5), izf);
        const nty = fmul(fadd(fmul(fr(-M4), pxf), M6), izf);
        const newGrad = fr(
          Math.hypot(
            fr(fadd(fmul(sf, nsx), fmul(tf, ntx)) / rf),
            fr(fadd(fmul(sf, nsy), fmul(tf, nty)) / rf),
          ),
        );
        maxNewErr = Math.max(maxNewErr, rel(newGrad, refGrad));
      }
    }

    // The pose is genuinely near-singular AND actually sampled on the band.
    expect(bandSamples).toBeGreaterThan(200);

    // (1) q, s, t, r are well-conditioned at this pose — the pixel-space back-
    //     projection survives f32 (the fragment header's claim). This isolates
    //     the bug to the gradient: everything the two f32 paths share is clean.
    expect(maxStrErr).toBeLessThan(1e-3);

    // (2) The bite: the OLD difference-of-products |grad r| is off by tens of
    //     percent — enough to swing the Sampson `dist` across the stroke
    //     threshold pixel-to-pixel and dither the fill (observed ~0.54).
    expect(maxOldErr).toBeGreaterThan(0.1);

    // (3) The fix: the affine-minor |grad r| tracks the f64 reference to a few
    //     parts in 1e4 (observed ~2.5e-5). The tolerance sits ~100× below the
    //     OLD floor and ~100× above the NEW value, so it fails on a real
    //     regression — reverting to difference-of-products, or a wrong minor
    //     sign/scale in composeOrbitConic — but not on a benign refactor.
    expect(maxNewErr).toBeLessThan(5e-3);

    // The fix is a decisive improvement, not a marginal one.
    expect(maxOldErr / maxNewErr).toBeGreaterThan(50);
  });
});
