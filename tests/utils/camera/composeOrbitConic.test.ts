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

// ── Clip basis (screen-space ribbon impostor, spec §2) ───────────────────────
//
// `clipBasis` hands the vertex stage the same (Cc, Ac, Bc) triple the CPU used
// to build `H` — narrowed, not rederived — so the ribbon vertex stage can walk
// the projected ellipse per sample. This test does NOT re-implement the
// projection as an oracle (that would be a mirror); it pins the externally-
// observable behaviour: the clip basis round-trips through the ordinary
// projection pipeline.

describe('composeOrbitConic — clip basis', () => {
  // NDC → pixel, the same viewport convention `projectToPixel` above uses.
  function ndcToPixel(ndcX: number, ndcY: number): Vec2 {
    return [(ndcX * 0.5 + 0.5) * viewportPx[0], (0.5 - 0.5 * ndcY) * viewportPx[1]];
  }

  it('the clip basis reprojects sample orbit points onto their projected pixels', () => {
    const { clipBasis } = composeOrbitConic(VP, C, A, B, viewportPx, renderOrigin);
    const [Cc, Ac, Bc] = clipBasis;

    for (const E of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, 0.7]) {
      const cosE = Math.cos(E);
      const sinE = Math.sin(E);
      const clipX = Cc[0]! + cosE * Ac[0]! + sinE * Bc[0]!;
      const clipY = Cc[1]! + cosE * Ac[1]! + sinE * Bc[1]!;
      const clipW = Cc[2]! + cosE * Ac[2]! + sinE * Bc[2]!;
      const [px, py] = ndcToPixel(clipX / clipW, clipY / clipW);

      const P: Vec3 = [
        C[0] + cosE * A[0] + sinE * B[0],
        C[1] + cosE * A[1] + sinE * B[1],
        C[2] + cosE * A[2] + sinE * B[2],
      ];
      const [expectedPx, expectedPy] = projectToPixel(P);

      expect(px).toBeCloseTo(expectedPx, 3);
      expect(py).toBeCloseTo(expectedPy, 3);
    }
  });
});

