import { describe, it, expect } from 'vitest';
import { mat4, mat4d, vec4 } from 'wgpu-matrix';
import { symmetricFrustum } from '../../../src/utils/camera/symmetricFrustum';
import { frustumPerspective } from '../../../src/utils/camera/frustumPerspective';
import { frustumPerspectiveF64 } from '../../../src/utils/camera/frustumPerspectiveF64';

const DEG = Math.PI / 180;
// The app's default 60° across common canvas shapes, plus odd fovs and aspects.
const SPREAD: readonly (readonly [number, number, number, number])[] = [
  [60 * DEG, 16 / 9, 0.01, 50000],
  [60 * DEG, 1920 / 1080, 1e-9, 3e-5],
  [60 * DEG, 2560 / 1329, 0.01, 50000],
  [60 * DEG, 390 / 844, 2e-13, 1e-6],
  [90 * DEG, 1, 1e-6, 10],
  [1, 16 / 9, 0.1, 10000],
  [0.3, 2.37, 5, 7],
  [2.5, 0.61, 1e-3, 1e9],
];

function expectUlps(got: number, want: number, ulps: number): void {
  if (ulps === 0) expect(got).toBe(want);
  else expect(Math.abs(got - want)).toBeLessThanOrEqual(ulps * Number.EPSILON * Math.abs(want));
}

describe('frustumPerspective', () => {
  it('symmetric frustum reproduces mat4.perspective exactly (f32)', () => {
    for (const [fov, aspect, near, far] of SPREAD) {
      const got = frustumPerspective(symmetricFrustum(fov, aspect), near, far);
      const want = mat4.perspective(fov, aspect, near, far);
      for (let i = 0; i < 16; i++) expect(got[i], `fov ${fov} el ${i}`).toBe(want[i]);
    }
  });

  // f64 cannot be exact: (fovY, aspect) → (tanUp, tanRight) is many-to-one
  // below ulp(aspect), so no tangent formula recovers `f / aspect` bit for bit.
  // The scales land within an ulp or two; they reach the GPU narrowed to f32.
  it('symmetric frustum matches mat4d.perspective to within 2 ulps (f64)', () => {
    for (const [fov, aspect, near, far] of SPREAD) {
      const got = frustumPerspectiveF64(symmetricFrustum(fov, aspect), near, far);
      const want = mat4d.perspective(fov, aspect, near, far);
      for (let i = 0; i < 16; i++) expectUlps(got[i]!, want[i]!, i === 0 || i === 5 ? 2 : 0);
    }
  });

  it('symmetric frustum reproduces infinite perspectiveReverseZ, x scale to within 1 ulp', () => {
    for (const [fov, aspect, near] of SPREAD) {
      const got = frustumPerspectiveF64(symmetricFrustum(fov, aspect), near, null);
      const want = mat4d.perspectiveReverseZ(fov, aspect, near);
      for (let i = 0; i < 16; i++) expectUlps(got[i]!, want[i]!, i === 0 ? 1 : 0);
    }
  });

  it('asymmetric frustum maps its edges to clip ±1', () => {
    const f = { tanLeft: -0.4, tanRight: 1.3, tanDown: -0.9, tanUp: 0.2 };
    for (const far of [100, null]) {
      const proj = frustumPerspectiveF64(f, 0.1, far);
      // View space looks down −z: a direction at depth 1 is (tan, tan, −1).
      const ndc = (x: number, y: number): [number, number] => {
        const c = vec4.transformMat4([x, y, -1, 1], proj, new Float64Array(4));
        return [c[0]! / c[3]!, c[1]! / c[3]!];
      };
      expect(ndc(f.tanLeft, 0)[0]).toBeCloseTo(-1, 12);
      expect(ndc(f.tanRight, 0)[0]).toBeCloseTo(1, 12);
      expect(ndc(0, f.tanDown)[1]).toBeCloseTo(-1, 12);
      expect(ndc(0, f.tanUp)[1]).toBeCloseTo(1, 12);
    }
  });
});
