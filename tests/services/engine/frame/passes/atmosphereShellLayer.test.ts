/**
 * atmosphereShellLayer's `invMvp` un-projection — a regression lock for the
 * `mat4d.inverse` dst-last / f64 contract (spec §9: "catching a dst-last/
 * f64-wrapper mistake before it reaches the GPU"). `mat4d.inverse` returns a
 * FRESH matrix rather than writing into a caller-supplied `dst`, and it must
 * run on the UN-narrowed f64 `mvp` (narrowing first reintroduces per-element
 * rounding — see `composeBodyMvp`'s header). Pure math: no GPU, engine
 * state, or ctx mocking.
 */

import { describe, it, expect } from 'vitest';
import { mat4d } from 'wgpu-matrix';
import { narrowMat4 } from '../../../../../src/utils/math/narrowMat4';

describe('invMvp inversion sanity (mat4d.inverse dst-last / f64 contract)', () => {
  it('unprojects a clip-space point through narrowMat4(mat4d.inverse(mvp)) back to the known local point', () => {
    // mvp = T(5,0,0) * S(2,2,2): a column vector v transforms as
    // world = 2*v_local + (5,0,0) — scale first, then translate (read
    // right-to-left, same convention composeBodyMvp documents).
    const mvp = mat4d.multiply(mat4d.translation([5, 0, 0]), mat4d.scaling([2, 2, 2]));

    // Its inverse undoes that in the opposite order: local = 0.5*(world - (5,0,0)),
    // i.e. S(0.5) * T(-5,0,0) — NOT computed via mat4d.inverse, so this isn't a
    // mirror test of the function under test.
    const invMvp = mat4d.inverse(mvp);
    const invMvpF32 = narrowMat4(invMvp);

    // A chosen clip-space point [7, 3, -2, 1]. Hand-worked expected unprojection:
    // local = 0.5*(7-5, 3, -2) = (1, 1.5, -1). mvp/invMvp are pure affine
    // (translate+scale only), so w stays 1 throughout — no perspective divide
    // needed, but the test still divides by w to exercise the real un-project path.
    const clip: [number, number, number, number] = [7, 3, -2, 1];

    // Plain column-major 4x4 * vec4 — hand-rolled, one-off verification, not a
    // reusable util: out[row] = sum_col m[col*4 + row] * v[col].
    const unprojected: [number, number, number, number] = [0, 0, 0, 0];
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let col = 0; col < 4; col++) {
        sum += invMvpF32[col * 4 + row]! * clip[col]!;
      }
      unprojected[row] = sum;
    }
    const [x, y, z, w] = unprojected;

    expect(w).toBeCloseTo(1, 6);
    expect(x! / w!).toBeCloseTo(1, 6);
    expect(y! / w!).toBeCloseTo(1.5, 6);
    expect(z! / w!).toBeCloseTo(-1, 6);
  });
});
