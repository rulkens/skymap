// gaussianRayCoeffs' q (lib/gaussianIntegral.wesl) against an f64 oracle. No
// TS twin of the shader exists, so this runs an f32 TRANSCRIPTION of both the
// old q = c - b*b/a and the new closest-point form, every op rounded with
// Math.fround. It proves the maths, not the WGSL: a shader revert is caught by
// the galaxy-renderer tool shots, not here.
import { describe, expect, it } from 'vitest';

type V3 = readonly [number, number, number];

const f = Math.fround;
const sub = (u: V3, v: V3): V3 => [f(u[0] - v[0]), f(u[1] - v[1]), f(u[2] - v[2])];
const scale = (u: V3, s: number): V3 => [f(u[0] * s), f(u[1] * s), f(u[2] * s)];
const dot = (u: V3, v: V3): number => f(f(f(u[0] * v[0]) + f(u[1] * v[1])) + f(u[2] * v[2]));
const bilinearForm = (u: V3, v: V3, mDiag: V3, mOff: V3): number => {
  const cross: V3 = [
    f(f(u[0] * v[1]) + f(u[1] * v[0])),
    f(f(u[0] * v[2]) + f(u[2] * v[0])),
    f(f(u[1] * v[2]) + f(u[2] * v[1])),
  ];
  const uv: V3 = [f(u[0] * v[0]), f(u[1] * v[1]), f(u[2] * v[2])];
  return f(dot(uv, mDiag) + dot(cross, mOff));
};
const qFrom = (oq: V3, d: V3, mDiag: V3, mOff: V3, a: number): number => {
  const b = bilinearForm(oq, d, mDiag, mOff);
  return f(bilinearForm(oq, oq, mDiag, mOff) - f(f(b * b) / a));
};
const oldQ = (o: V3, d: V3, mDiag: V3, mOff: V3): number =>
  qFrom(o, d, mDiag, mOff, bilinearForm(d, d, mDiag, mOff));
const newQ = (o: V3, d: V3, mDiag: V3, mOff: V3): number =>
  qFrom(sub(o, scale(d, dot(o, d))), d, mDiag, mOff, bilinearForm(d, d, mDiag, mOff));

// f64 oracle: the same quadratic's minimum, with no rounding anywhere.
const exactQ = (o: V3, d: V3, mDiag: V3, mOff: V3): number => {
  const form = (u: V3, v: V3) =>
    u[0] * v[0] * mDiag[0] +
    u[1] * v[1] * mDiag[1] +
    u[2] * v[2] * mDiag[2] +
    (u[0] * v[1] + u[1] * v[0]) * mOff[0] +
    (u[0] * v[2] + u[2] * v[0]) * mOff[1] +
    (u[1] * v[2] + u[2] * v[1]) * mOff[2];
  const b = form(o, d);
  return form(o, o) - (b * b) / form(d, d);
};

// The galaxy-renderer tool's outside pose, pixel (423, 393): a compact HII
// shell ~31 kpc from the eye, where c ~ 4e8 and q ~ 16 sits just under
// SPLAT_CUT^2 = 20.25. Eye minus centre and the pixel's unit ray, as f32.
const SHELL_O = sub(
  [13.536450386047363, 26.890119552612305, 7.394996166229248],
  [-0.9396944046020508, -0.0038825429510325193, 1.198266625404358],
);
const SHELL_D: V3 = [-0.46432051062583923, -0.8630545735359192, -0.19885489344596863];
const SHELL_M: V3 = [393161.625, 393161.625, 393161.625];

describe('gaussianRayCoeffs q precision', () => {
  it('matches f64 for a far compact shell, where c - b*b/a from the eye is off by > 1', () => {
    const zero: V3 = [0, 0, 0];
    const exact = exactQ(SHELL_O, SHELL_D, SHELL_M, zero);
    expect(Math.abs(oldQ(SHELL_O, SHELL_D, SHELL_M, zero) - exact)).toBeGreaterThan(1);
    expect(newQ(SHELL_O, SHELL_D, SHELL_M, zero)).toBeCloseTo(exact, 1);
  });

  it('matches f64 for a sheared anisotropic M', () => {
    const mDiag: V3 = [f(4e5), f(9e4), f(2.5e5)];
    const mOff: V3 = [f(6e4), f(-3e4), f(1e4)];
    const exact = exactQ(SHELL_O, SHELL_D, mDiag, mOff);
    expect(newQ(SHELL_O, SHELL_D, mDiag, mOff)).toBeCloseTo(exact, 1);
  });
});
